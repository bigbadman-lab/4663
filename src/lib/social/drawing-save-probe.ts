/**
 * DRAW save-failure investigation helpers.
 * Deterministic drawings + payload metrics. Not used by the live editor.
 */

import {
  countDrawingPoints,
  createEphemeralDrawingObject,
  DRAWING_MAX_POINTS_PER_STROKE,
  DRAWING_MAX_STROKES,
  DRAWING_MAX_TOTAL_POINTS,
  EMPTY_EPHEMERAL_DRAWINGS_PAGE_DATA,
  normalizeEphemeralDrawingsPageData,
  strokeToSvgPoints,
  upsertEphemeralDrawing,
  type DrawingColour,
  type DrawingStroke,
  type EphemeralDrawingsPageData,
} from "@/lib/social/ephemeral-drawing";
import { drawingDraftCanPublish } from "@/lib/social/drawing-draft";

export const DRAWING_PROBE_OWNER =
  "550e8400-e29b-41d4-a716-446655440000" as const;
export const DRAWING_PROBE_ID =
  "7c9e6679-7425-40de-944b-e07fc1f90ae7" as const;

const PROBE_GEOM = {
  leftPct: 40,
  topPct: 50,
  widthPct: 22,
  heightPct: 22,
  aspectRatio: 1.6,
} as const;

export type DrawingPayloadMetrics = {
  strokeCount: number;
  totalPointCount: number;
  maxPointsInOneStroke: number;
  drawingJsonChars: number;
  drawingUtf8Bytes: number;
  pageDataUtf8Bytes: number;
  svgPathChars: number;
};

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Build a drawing with independent stroke-count vs points-per-stroke axes.
 * Points walk a deterministic diagonal so sampling delta is irrelevant.
 */
export function generateDrawingStrokes(input: {
  strokeCount: number;
  pointsPerStroke: number;
  colour?: DrawingColour;
}): DrawingStroke[] {
  const colour = input.colour ?? "#171717";
  const strokes: DrawingStroke[] = [];
  const strokeCount = Math.max(0, Math.floor(input.strokeCount));
  const pointsPerStroke = Math.max(0, Math.floor(input.pointsPerStroke));
  for (let s = 0; s < strokeCount; s += 1) {
    const points = [];
    for (let p = 0; p < pointsPerStroke; p += 1) {
      const t = pointsPerStroke <= 1 ? 0 : p / (pointsPerStroke - 1);
      points.push({
        x: Math.min(1, Math.max(0, (s * 0.017 + t * 0.81) % 1)),
        y: Math.min(1, Math.max(0, (s * 0.023 + t * 0.73) % 1)),
      });
    }
    strokes.push({ colour, points });
  }
  return strokes;
}

/** Distribute `totalPoints` across `strokeCount` strokes (last stroke takes remainder). */
export function generateDrawingByTotalPoints(input: {
  strokeCount: number;
  totalPoints: number;
  colour?: DrawingColour;
}): DrawingStroke[] {
  const strokeCount = Math.max(1, Math.floor(input.strokeCount));
  const totalPoints = Math.max(0, Math.floor(input.totalPoints));
  const base = Math.floor(totalPoints / strokeCount);
  const remainder = totalPoints - base * strokeCount;
  const strokes: DrawingStroke[] = [];
  for (let s = 0; s < strokeCount; s += 1) {
    const n = base + (s < remainder ? 1 : 0);
    const [generated] = generateDrawingStrokes({
      strokeCount: 1,
      pointsPerStroke: n,
      colour: input.colour,
    });
    if (!generated) continue;
    strokes.push({
      colour: generated.colour,
      points: generated.points.map((p) => ({
        x: (p.x + s * 0.01) % 1,
        y: (p.y + s * 0.013) % 1,
      })),
    });
  }
  return strokes;
}

export function measureDrawingPayload(
  strokes: readonly DrawingStroke[],
  pageData?: EphemeralDrawingsPageData,
): DrawingPayloadMetrics {
  const strokeCount = strokes.length;
  const totalPointCount = countDrawingPoints(strokes);
  const maxPointsInOneStroke = strokes.reduce(
    (max, stroke) => Math.max(max, stroke.points.length),
    0,
  );
  const drawingJson = JSON.stringify(strokes);
  const pageJson = JSON.stringify(pageData ?? { drawings: [{ strokes }] });
  const svgPathChars = strokes.reduce(
    (sum, stroke) => sum + strokeToSvgPoints(stroke.points).length,
    0,
  );
  return {
    strokeCount,
    totalPointCount,
    maxPointsInOneStroke,
    drawingJsonChars: drawingJson.length,
    drawingUtf8Bytes: utf8ByteLength(drawingJson),
    pageDataUtf8Bytes: utf8ByteLength(pageJson),
    svgPathChars,
  };
}

export type SimulatedDrawingPublishResult = {
  metrics: DrawingPayloadMetrics;
  validationPasses: boolean;
  validationError: string | null;
  /** True when create() succeeded and we attempted a page-data write. */
  playhtmlWriteAttempted: boolean;
  /** JSON round-trip of upserted page data (PlayHTML stores JSON-like Yjs maps). */
  playhtmlAccepted: boolean;
  readBackPersisted: boolean;
  /** Mirrors current DRAW DONE: editor closes only after create() succeeds. */
  doneWouldClose: boolean;
  doneWouldRemainOpen: boolean;
  stage: "empty" | "validate" | "page-data";
};

/**
 * Reproduce DRAW DONE without React/PlayHTML:
 * createEphemeralDrawingObject → upsert → JSON clone → normalize read-back.
 */
export function simulateDrawingPublish(input: {
  strokes: DrawingStroke[];
  previous?: EphemeralDrawingsPageData;
  drawingId?: string;
  ownerSessionId?: string;
}): SimulatedDrawingPublishResult {
  const strokes = input.strokes;
  const previous = input.previous ?? EMPTY_EPHEMERAL_DRAWINGS_PAGE_DATA;

  if (!drawingDraftCanPublish(strokes)) {
    return {
      metrics: measureDrawingPayload(strokes, previous),
      validationPasses: false,
      validationError: "empty",
      playhtmlWriteAttempted: false,
      playhtmlAccepted: false,
      readBackPersisted: false,
      doneWouldClose: false,
      doneWouldRemainOpen: true,
      stage: "empty",
    };
  }

  const created = createEphemeralDrawingObject({
    drawingId: input.drawingId ?? DRAWING_PROBE_ID,
    ownerSessionId: input.ownerSessionId ?? DRAWING_PROBE_OWNER,
    strokes,
    ...PROBE_GEOM,
    now: () => new Date("2026-08-15T00:00:00.000Z"),
  });
  if (!created.ok) {
    return {
      metrics: measureDrawingPayload(strokes, previous),
      validationPasses: false,
      validationError: created.error,
      playhtmlWriteAttempted: false,
      playhtmlAccepted: false,
      readBackPersisted: false,
      doneWouldClose: false,
      doneWouldRemainOpen: true,
      stage: "validate",
    };
  }

  const next = upsertEphemeralDrawing(previous, created.drawing);
  const serialized = JSON.stringify(next);
  const readBack = normalizeEphemeralDrawingsPageData(JSON.parse(serialized));
  const persisted = readBack.drawings.some(
    (d) => d.drawingId === created.drawing.drawingId,
  );

  return {
    metrics: {
      ...measureDrawingPayload(strokes, next),
      pageDataUtf8Bytes: utf8ByteLength(serialized),
    },
    validationPasses: true,
    validationError: null,
    playhtmlWriteAttempted: true,
    playhtmlAccepted: persisted,
    readBackPersisted: persisted,
    doneWouldClose: true,
    doneWouldRemainOpen: false,
    stage: "page-data",
  };
}

export const DRAWING_EXPLICIT_LIMITS = {
  maxStrokes: DRAWING_MAX_STROKES,
  maxPointsPerStroke: DRAWING_MAX_POINTS_PER_STROKE,
  maxTotalPoints: DRAWING_MAX_TOTAL_POINTS,
} as const;
