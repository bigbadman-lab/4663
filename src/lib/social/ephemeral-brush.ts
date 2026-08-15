/**
 * Social 3B — ephemeral BRUSH (world-space strokes).
 * PlayHTML page data for finished strokes; Broadcast drafts in brush-draft.ts.
 * Points are world % (same space as TEXT/DRAW hosts), not OBJECT local 0–1.
 */

import {
  DEFAULT_DRAWING_COLOUR,
  DRAW_COLOURS,
  DRAWING_BRUSH_SIZE,
  DRAWING_COLOUR_PALETTE,
  isDrawingColour,
  type DrawingColour,
} from "@/lib/social/ephemeral-drawing";
import {
  DRAWING_ZONE_WIDTH_WORLD_PCT,
  WORLD_WIDTH_PX,
  clampWorldPct,
} from "@/lib/canvas/world-camera";
import {
  isUuid,
  normalizeSessionId,
} from "@/lib/presence/session-id";

export const EPHEMERAL_BRUSH_PAGE_DATA_NAME =
  "4663-ephemeral-brush-strokes" as const;

/** Mirror OBJECT stroke caps — do not raise OBJECT limits. */
export const BRUSH_MAX_STROKES = 40 as const;
export const BRUSH_MAX_POINTS_PER_STROKE = 200 as const;
export const BRUSH_MAX_TOTAL_POINTS = 2_000 as const;

/**
 * Min segment length in world % before sampling.
 * ≈ OBJECT 0.008 of a ~6.6% zone → ~0.05 world %; slightly higher for freehand.
 */
export const BRUSH_POINT_MIN_DELTA_WORLD_PCT = 0.06 as const;

/**
 * Stroke width in world px so visual weight ≈ OBJECT DRAWING_BRUSH_SIZE
 * inside the canonical drawing zone.
 */
export const BRUSH_STROKE_WIDTH_WORLD_PX =
  (DRAWING_BRUSH_SIZE / 100) *
  (DRAWING_ZONE_WIDTH_WORLD_PCT / 100) *
  WORLD_WIDTH_PX;

export {
  DRAW_COLOURS as BRUSH_COLOURS,
  DRAWING_COLOUR_PALETTE as BRUSH_COLOUR_PALETTE,
  DEFAULT_DRAWING_COLOUR as DEFAULT_BRUSH_COLOUR,
};
export type BrushColour = DrawingColour;

/** World percentage point (0–100), same axis as leftPct / topPct. */
export type BrushPoint = {
  x: number;
  y: number;
};

export type BrushStroke = {
  colour: BrushColour;
  points: BrushPoint[];
};

/** One session-owned brush document (grouped strokes, not movable objects). */
export type EphemeralBrushDocument = {
  documentId: string;
  ownerSessionId: string;
  strokes: BrushStroke[];
  createdAt: string;
  updatedAt: string;
};

export type EphemeralBrushPageData = {
  documents: EphemeralBrushDocument[];
};

export const EMPTY_EPHEMERAL_BRUSH_PAGE_DATA: EphemeralBrushPageData = {
  documents: [],
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clampWorldPctLoose(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, value));
}

export function normalizeBrushPoint(raw: unknown): BrushPoint | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isFiniteNumber(record.x) || !isFiniteNumber(record.y)) return null;
  // Allow slight out-of-range from rounding; clamp into world %.
  if (record.x < -5 || record.x > 105) return null;
  if (record.y < -5 || record.y > 105) return null;
  return {
    x: clampWorldPctLoose(record.x),
    y: clampWorldPctLoose(record.y),
  };
}

export function normalizeBrushStroke(raw: unknown): BrushStroke | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isDrawingColour(record.colour)) return null;
  if (!Array.isArray(record.points)) return null;
  if (record.points.length === 0) return null;
  if (record.points.length > BRUSH_MAX_POINTS_PER_STROKE) return null;

  const points: BrushPoint[] = [];
  for (const item of record.points) {
    const point = normalizeBrushPoint(item);
    if (!point) return null;
    points.push(point);
  }
  if (points.length === 0) return null;
  return { colour: record.colour, points };
}

export function countBrushPoints(strokes: readonly BrushStroke[]): number {
  return strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
}

export function hasMeaningfulBrushStrokes(
  strokes: readonly BrushStroke[],
): boolean {
  return strokes.some((stroke) => stroke.points.length >= 1);
}

export function normalizeBrushStrokes(raw: unknown): BrushStroke[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > BRUSH_MAX_STROKES) return null;

  const strokes: BrushStroke[] = [];
  let totalPoints = 0;
  for (const item of raw) {
    const stroke = normalizeBrushStroke(item);
    if (!stroke) return null;
    totalPoints += stroke.points.length;
    if (totalPoints > BRUSH_MAX_TOTAL_POINTS) return null;
    strokes.push(stroke);
  }
  return strokes;
}

/** Trim strokes to hard caps (used when appending session documents). */
export function trimBrushStrokesToCaps(
  strokes: readonly BrushStroke[],
): BrushStroke[] {
  const out: BrushStroke[] = [];
  let totalPoints = 0;
  for (const stroke of strokes) {
    if (out.length >= BRUSH_MAX_STROKES) break;
    if (!isDrawingColour(stroke.colour)) continue;
    const points: BrushPoint[] = [];
    for (const p of stroke.points) {
      if (points.length >= BRUSH_MAX_POINTS_PER_STROKE) break;
      if (totalPoints >= BRUSH_MAX_TOTAL_POINTS) break;
      if (!isFiniteNumber(p.x) || !isFiniteNumber(p.y)) continue;
      points.push({
        x: clampWorldPctLoose(p.x),
        y: clampWorldPctLoose(p.y),
      });
      totalPoints += 1;
    }
    if (points.length === 0) continue;
    out.push({ colour: stroke.colour, points });
    if (totalPoints >= BRUSH_MAX_TOTAL_POINTS) break;
  }
  return out;
}

export function normalizeEphemeralBrushDocument(
  raw: unknown,
): EphemeralBrushDocument | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  if (!isUuid(record.documentId)) return null;
  if (!isUuid(record.ownerSessionId)) return null;

  const strokes = normalizeBrushStrokes(record.strokes);
  if (!strokes || !hasMeaningfulBrushStrokes(strokes)) return null;

  if (typeof record.createdAt !== "string" || record.createdAt.trim() === "") {
    return null;
  }
  if (!Number.isFinite(Date.parse(record.createdAt))) return null;
  if (typeof record.updatedAt !== "string" || record.updatedAt.trim() === "") {
    return null;
  }
  if (!Number.isFinite(Date.parse(record.updatedAt))) return null;

  return {
    documentId: normalizeSessionId(record.documentId),
    ownerSessionId: normalizeSessionId(record.ownerSessionId),
    strokes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function normalizeEphemeralBrushPageData(
  raw: unknown,
): EphemeralBrushPageData {
  if (raw === null || typeof raw !== "object") {
    return { documents: [] };
  }
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.documents)) {
    return { documents: [] };
  }

  const seen = new Set<string>();
  const documents: EphemeralBrushDocument[] = [];
  for (const item of record.documents) {
    const normalized = normalizeEphemeralBrushDocument(item);
    if (!normalized) continue;
    if (seen.has(normalized.documentId)) continue;
    seen.add(normalized.documentId);
    documents.push(normalized);
  }
  return { documents };
}

export type CreateEphemeralBrushDocumentInput = {
  documentId: string;
  ownerSessionId: string;
  strokes: BrushStroke[];
  now?: () => Date;
};

export type CreateEphemeralBrushDocumentResult =
  | { ok: true; document: EphemeralBrushDocument }
  | { ok: false; error: string };

export function createEphemeralBrushDocument(
  input: CreateEphemeralBrushDocumentInput,
): CreateEphemeralBrushDocumentResult {
  if (!isUuid(input.documentId) || !isUuid(input.ownerSessionId)) {
    return { ok: false, error: "Invalid brush document." };
  }
  const strokes = trimBrushStrokesToCaps(input.strokes);
  if (!hasMeaningfulBrushStrokes(strokes)) {
    return { ok: false, error: "Draw something first." };
  }

  const now = input.now ?? (() => new Date());
  const iso = now().toISOString();
  return {
    ok: true,
    document: {
      documentId: normalizeSessionId(input.documentId),
      ownerSessionId: normalizeSessionId(input.ownerSessionId),
      strokes,
      createdAt: iso,
      updatedAt: iso,
    },
  };
}

/** PlayHTML `usePageData().setData` no-ops while loading or without a provider. */
export function isBrushPageDataWritable(input: {
  isLoading: boolean;
  isProviderMissing: boolean;
}): boolean {
  return !input.isLoading && !input.isProviderMissing;
}

export type BrushDoneIntent = "publish" | "keep-editing";

/** Empty DONE must not cancel; only meaningful strokes attempt publish. */
export function resolveBrushDoneIntent(
  strokes: readonly BrushStroke[],
): BrushDoneIntent {
  return hasMeaningfulBrushStrokes(strokes) ? "publish" : "keep-editing";
}

export type CommitBrushPublishResult =
  | { ok: true; pageData: EphemeralBrushPageData }
  | { ok: false; reason: "empty" | "not-ready" | "rejected" };

/**
 * Commit BRUSH strokes into page data. Does not close the editor.
 * Callers must keep the overlay open when `ok` is false.
 */
export function commitBrushPublish(input: {
  previous: EphemeralBrushPageData;
  ownerSessionId: string;
  documentId: string;
  strokes: BrushStroke[];
  ready: boolean;
  now?: () => Date;
}): CommitBrushPublishResult {
  if (!hasMeaningfulBrushStrokes(input.strokes)) {
    return { ok: false, reason: "empty" };
  }
  if (!input.ready) {
    return { ok: false, reason: "not-ready" };
  }
  const pageData = upsertBrushStrokesForOwner(input.previous, {
    ownerSessionId: input.ownerSessionId,
    documentId: input.documentId,
    strokes: input.strokes,
    now: input.now,
  });
  if (!pageData) {
    return { ok: false, reason: "rejected" };
  }
  return { ok: true, pageData };
}

/**
 * Append strokes into the owner's existing document, or create one.
 * Enforces session caps on the merged result.
 */
export function upsertBrushStrokesForOwner(
  data: EphemeralBrushPageData,
  input: {
    ownerSessionId: string;
    documentId: string;
    strokes: BrushStroke[];
    now?: () => Date;
  },
): EphemeralBrushPageData | null {
  if (!isUuid(input.ownerSessionId) || !isUuid(input.documentId)) return null;
  if (!hasMeaningfulBrushStrokes(input.strokes)) return null;

  const owner = normalizeSessionId(input.ownerSessionId);
  const now = input.now ?? (() => new Date());
  const iso = now().toISOString();
  const existing = data.documents.find((d) => d.ownerSessionId === owner);

  if (!existing) {
    const created = createEphemeralBrushDocument({
      documentId: input.documentId,
      ownerSessionId: owner,
      strokes: input.strokes,
      now,
    });
    if (!created.ok) return null;
    return { documents: [...data.documents, created.document] };
  }

  const merged = trimBrushStrokesToCaps([
    ...existing.strokes,
    ...input.strokes,
  ]);
  if (!hasMeaningfulBrushStrokes(merged)) return null;

  const nextDoc: EphemeralBrushDocument = {
    ...existing,
    strokes: merged,
    updatedAt: iso,
  };
  return {
    documents: data.documents.map((d) =>
      d.ownerSessionId === owner ? nextDoc : d,
    ),
  };
}

export function removeEphemeralBrushDocumentsByOwner(
  data: EphemeralBrushPageData,
  ownerSessionId: string,
): EphemeralBrushPageData {
  const owner = normalizeSessionId(ownerSessionId);
  return {
    documents: data.documents.filter((d) => d.ownerSessionId !== owner),
  };
}

export function retainEphemeralBrushDocumentsForPresentOwners(
  data: EphemeralBrushPageData,
  presentSessionIds: ReadonlySet<string>,
): EphemeralBrushPageData {
  return {
    documents: data.documents.filter((d) =>
      presentSessionIds.has(d.ownerSessionId),
    ),
  };
}

export function shouldAppendBrushPoint(
  last: BrushPoint | null,
  next: BrushPoint,
  minDelta: number = BRUSH_POINT_MIN_DELTA_WORLD_PCT,
): boolean {
  if (!last) return true;
  const dx = next.x - last.x;
  const dy = next.y - last.y;
  return dx * dx + dy * dy >= minDelta * minDelta;
}

/** SVG polyline points from world % (x/y → same user units as viewBox 0–100). */
export function brushStrokeToSvgPoints(
  points: readonly BrushPoint[],
): string {
  return points
    .map(
      (p) =>
        `${clampWorldPctLoose(p.x).toFixed(2)},${clampWorldPctLoose(p.y).toFixed(2)}`,
    )
    .join(" ");
}

/** Map a client point through the canonical camera into world %. */
export function clientPointToBrushWorldPct(
  clientX: number,
  clientY: number,
  screenPointToWorldPctFn: (
    clientX: number,
    clientY: number,
    viewport: { left: number; top: number; width: number; height: number },
    camera: { x: number; y: number; scale: number },
  ) => { leftPct: number; topPct: number },
  snapshot: {
    viewport: { left: number; top: number; width: number; height: number };
    camera: { x: number; y: number; scale: number };
  } | null,
): BrushPoint | null {
  if (!snapshot) return null;
  const pct = screenPointToWorldPctFn(
    clientX,
    clientY,
    snapshot.viewport,
    snapshot.camera,
  );
  return {
    x: clampWorldPct(pct.leftPct),
    y: clampWorldPct(pct.topPct),
  };
}
