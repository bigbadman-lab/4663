/**
 * Social 3A — ephemeral finished DRAW helpers.
 * Shared room state lives in PlayHTML usePageData (late-join safe).
 * Live drafts are Broadcast-only (see drawing-draft.ts).
 */

import {
  DRAWING_ZONE_HEIGHT_WORLD_PCT,
  DRAWING_ZONE_WIDTH_WORLD_PCT,
  drawingZoneAspectFromWorldPct,
  drawingZoneOriginFromWorldPct,
} from "@/lib/canvas/world-camera";
import {
  DEFAULT_DRAWING_COLOUR,
  DRAW_COLOURS,
  DRAWING_COLOUR_PALETTE,
  isDrawingColour,
  type DrawingColour,
} from "@/lib/social/draw-colours";
import { clampCanvasPct } from "@/lib/social/ephemeral-text";
import {
  isUuid,
  normalizeSessionId,
} from "@/lib/presence/session-id";

export const EPHEMERAL_DRAWINGS_PAGE_DATA_NAME =
  "4663-ephemeral-drawings" as const;

/** Fixed brush — one size only (SVG user units in 0–100 viewBox). */
export const DRAWING_BRUSH_SIZE = 2.75 as const;

/**
 * Compact drawing zone as % of the fixed world (IC2).
 * Sized so HOME-view visual ≈ pre-IC1 22%×22% of the 1440×900 artboard.
 */
export const DRAWING_ZONE_WIDTH_PCT = DRAWING_ZONE_WIDTH_WORLD_PCT;
export const DRAWING_ZONE_HEIGHT_PCT = DRAWING_ZONE_HEIGHT_WORLD_PCT;

/**
 * Accepted width/height % for drafts + page-data (IC3.3).
 * Floor must allow IC2 world zones (~6.6% × ~6.1875%); ceiling keeps legacy ~22%.
 */
export const DRAWING_SIZE_PCT_MIN = 4 as const;
export const DRAWING_SIZE_PCT_MAX = 40 as const;

/**
 * Frozen authoring aspect ratio bounds (pixel width / pixel height).
 * Covers square-ish zones and extreme but plausible canvas ratios.
 */
export const DRAWING_ASPECT_RATIO_MIN = 0.1 as const;
export const DRAWING_ASPECT_RATIO_MAX = 10 as const;

export const DRAWING_MAX_STROKES = 40 as const;
export const DRAWING_MAX_POINTS_PER_STROKE = 200 as const;
export const DRAWING_MAX_TOTAL_POINTS = 2_500 as const;
export const DRAWING_TOTAL_POINTS_LIMIT_COPY = "2,500 points max" as const;

/** Minimum segment length in normalized 0–1 space before sampling a new point. */
export const DRAWING_POINT_MIN_DELTA = 0.008 as const;

export {
  DEFAULT_DRAWING_COLOUR,
  DRAW_COLOURS,
  DRAWING_COLOUR_PALETTE,
  isDrawingColour,
  type DrawingColour,
};

export type DrawingPoint = {
  /** Normalized 0–1 within the drawing bounding box. */
  x: number;
  /** Normalized 0–1 within the drawing bounding box. */
  y: number;
};

/** Colour is per stroke (keeps multi-colour MVP without a drawing-level colour field). */
export type DrawingStroke = {
  colour: DrawingColour;
  points: DrawingPoint[];
};

export type EphemeralDrawingObject = {
  drawingId: string;
  ownerSessionId: string;
  strokes: DrawingStroke[];
  leftPct: number;
  topPct: number;
  widthPct: number;
  /** Legacy size hint; layout uses widthPct + aspectRatio, not responsive height%. */
  heightPct: number;
  /** Pixel width / pixel height of the authoring surface (frozen). */
  aspectRatio: number;
  createdAt: string;
};

export type EphemeralDrawingsPageData = {
  drawings: EphemeralDrawingObject[];
};

export const EMPTY_EPHEMERAL_DRAWINGS_PAGE_DATA: EphemeralDrawingsPageData = {
  drawings: [],
};

export function playhtmlDrawingElementId(drawingId: string): string {
  return `4663-drawing-${drawingId}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizeDrawingPoint(raw: unknown): DrawingPoint | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isFiniteNumber(record.x) || !isFiniteNumber(record.y)) return null;
  if (record.x < -0.05 || record.x > 1.05) return null;
  if (record.y < -0.05 || record.y > 1.05) return null;
  return { x: clamp01(record.x), y: clamp01(record.y) };
}

export function normalizeDrawingStroke(raw: unknown): DrawingStroke | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isDrawingColour(record.colour)) return null;
  if (!Array.isArray(record.points)) return null;
  if (record.points.length === 0) return null;
  if (record.points.length > DRAWING_MAX_POINTS_PER_STROKE) return null;

  const points: DrawingPoint[] = [];
  for (const item of record.points) {
    const point = normalizeDrawingPoint(item);
    if (!point) return null;
    points.push(point);
  }
  if (points.length === 0) return null;
  return { colour: record.colour, points };
}

export function countDrawingPoints(
  strokes: readonly DrawingStroke[],
): number {
  return strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
}

export function drawingCanAcceptAnotherPoint(
  strokes: readonly DrawingStroke[],
): boolean {
  return countDrawingPoints(strokes) < DRAWING_MAX_TOTAL_POINTS;
}

export function hasMeaningfulStrokes(
  strokes: readonly DrawingStroke[],
): boolean {
  return strokes.some((stroke) => stroke.points.length >= 1);
}

export function normalizeDrawingStrokes(
  raw: unknown,
): DrawingStroke[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > DRAWING_MAX_STROKES) return null;

  const strokes: DrawingStroke[] = [];
  let totalPoints = 0;
  for (const item of raw) {
    const stroke = normalizeDrawingStroke(item);
    if (!stroke) return null;
    totalPoints += stroke.points.length;
    if (totalPoints > DRAWING_MAX_TOTAL_POINTS) return null;
    strokes.push(stroke);
  }
  return strokes;
}

function clampSizePct(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  // Allow IC2 world-safe zone (~6.6%) while rejecting absurd sizes.
  return Math.min(DRAWING_SIZE_PCT_MAX, Math.max(DRAWING_SIZE_PCT_MIN, value));
}

export function isValidDrawingAspectRatio(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= DRAWING_ASPECT_RATIO_MIN &&
    value <= DRAWING_ASPECT_RATIO_MAX
  );
}

/** Accept finite positive ratios in MVP bounds; otherwise null. */
export function normalizeDrawingAspectRatio(
  value: unknown,
): number | null {
  if (!isValidDrawingAspectRatio(value)) return null;
  return value;
}

/** Legacy fallback: widthPct/heightPct (may be 1 for equal zone %). */
export function fallbackAspectRatioFromSizePct(
  widthPct: number,
  heightPct: number,
): number | null {
  if (!Number.isFinite(widthPct) || !Number.isFinite(heightPct)) return null;
  if (heightPct === 0) return null;
  return normalizeDrawingAspectRatio(widthPct / heightPct);
}

/**
 * Resolve aspectRatio from explicit field or legacy widthPct/heightPct.
 * Present-but-invalid aspectRatio rejects (no silent fallback).
 * Missing aspectRatio derives from size % for backward compatibility.
 */
export function resolveDrawingAspectRatio(input: {
  aspectRatio?: unknown;
  widthPct: number;
  heightPct: number;
}): number | null {
  if (input.aspectRatio !== undefined) {
    return normalizeDrawingAspectRatio(input.aspectRatio);
  }
  return fallbackAspectRatioFromSizePct(input.widthPct, input.heightPct);
}

/**
 * Authoring-zone pixel aspect from canvas bounds + zone size %.
 * Used once when DRAW mode opens — not recomputed on resize.
 */
export function measureDrawingZoneAspectRatio(
  canvasWidthPx: number,
  canvasHeightPx: number,
  widthPct: number,
  heightPct: number,
): number | null {
  if (
    !Number.isFinite(canvasWidthPx) ||
    !Number.isFinite(canvasHeightPx) ||
    canvasWidthPx <= 0 ||
    canvasHeightPx <= 0
  ) {
    return null;
  }
  if (!Number.isFinite(widthPct) || !Number.isFinite(heightPct)) return null;
  if (widthPct <= 0 || heightPct <= 0) return null;

  const zoneWidthPx = (canvasWidthPx * widthPct) / 100;
  const zoneHeightPx = (canvasHeightPx * heightPct) / 100;
  if (zoneWidthPx <= 0 || zoneHeightPx <= 0) return null;
  return normalizeDrawingAspectRatio(zoneWidthPx / zoneHeightPx);
}

/**
 * Host physical aspect under width% + CSS aspect-ratio layout.
 * Independent of canvas height — proves resize invariance.
 */
export function hostPhysicalAspectFromWidthAndRatio(
  canvasWidthPx: number,
  widthPct: number,
  aspectRatio: number,
): number | null {
  if (!isValidDrawingAspectRatio(aspectRatio)) return null;
  if (!Number.isFinite(canvasWidthPx) || canvasWidthPx <= 0) return null;
  if (!Number.isFinite(widthPct) || widthPct <= 0) return null;
  const hostWidthPx = (canvasWidthPx * widthPct) / 100;
  const hostHeightPx = hostWidthPx / aspectRatio;
  if (hostHeightPx <= 0) return null;
  return hostWidthPx / hostHeightPx;
}

export function normalizeEphemeralDrawingObject(
  raw: unknown,
): EphemeralDrawingObject | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  if (!isUuid(record.drawingId)) return null;
  if (!isUuid(record.ownerSessionId)) return null;

  const strokes = normalizeDrawingStrokes(record.strokes);
  if (!strokes || !hasMeaningfulStrokes(strokes)) return null;

  if (
    !isFiniteNumber(record.leftPct) ||
    !isFiniteNumber(record.topPct) ||
    !isFiniteNumber(record.widthPct) ||
    !isFiniteNumber(record.heightPct)
  ) {
    return null;
  }
  if (record.leftPct < -5 || record.leftPct > 105) return null;
  if (record.topPct < -5 || record.topPct > 105) return null;
  if (
    record.widthPct < DRAWING_SIZE_PCT_MIN ||
    record.widthPct > DRAWING_SIZE_PCT_MAX
  ) {
    return null;
  }
  if (
    record.heightPct < DRAWING_SIZE_PCT_MIN ||
    record.heightPct > DRAWING_SIZE_PCT_MAX
  ) {
    return null;
  }

  const widthPct = clampSizePct(record.widthPct, DRAWING_ZONE_WIDTH_PCT);
  const heightPct = clampSizePct(record.heightPct, DRAWING_ZONE_HEIGHT_PCT);
  const aspectRatio = resolveDrawingAspectRatio({
    aspectRatio: record.aspectRatio,
    widthPct,
    heightPct,
  });
  if (aspectRatio === null) return null;

  if (typeof record.createdAt !== "string" || record.createdAt.trim() === "") {
    return null;
  }
  if (!Number.isFinite(Date.parse(record.createdAt))) return null;

  return {
    drawingId: normalizeSessionId(record.drawingId),
    ownerSessionId: normalizeSessionId(record.ownerSessionId),
    strokes,
    leftPct: clampCanvasPct(record.leftPct),
    topPct: clampCanvasPct(record.topPct),
    widthPct,
    heightPct,
    aspectRatio,
    createdAt: record.createdAt,
  };
}

export function normalizeEphemeralDrawingsPageData(
  raw: unknown,
): EphemeralDrawingsPageData {
  if (raw === null || typeof raw !== "object") {
    return { drawings: [] };
  }
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.drawings)) {
    return { drawings: [] };
  }

  const seen = new Set<string>();
  const drawings: EphemeralDrawingObject[] = [];
  for (const item of record.drawings) {
    const normalized = normalizeEphemeralDrawingObject(item);
    if (!normalized) continue;
    if (seen.has(normalized.drawingId)) continue;
    seen.add(normalized.drawingId);
    drawings.push(normalized);
  }
  return { drawings };
}

/** Center a drawing zone on a world % click; clamp the full zone inside the world. */
export function drawingZoneOriginFromClick(
  leftPct: number,
  topPct: number,
  widthPct: number = DRAWING_ZONE_WIDTH_PCT,
  heightPct: number = DRAWING_ZONE_HEIGHT_PCT,
): { leftPct: number; topPct: number; widthPct: number; heightPct: number } {
  return drawingZoneOriginFromWorldPct(leftPct, topPct, widthPct, heightPct);
}

/** Deterministic zone aspect from fixed world pixel dimensions (no DOM measure). */
export function drawingZoneWorldAspectRatio(
  widthPct: number = DRAWING_ZONE_WIDTH_PCT,
  heightPct: number = DRAWING_ZONE_HEIGHT_PCT,
): number {
  return drawingZoneAspectFromWorldPct(widthPct, heightPct);
}

export type CreateEphemeralDrawingInput = {
  drawingId: string;
  ownerSessionId: string;
  strokes: DrawingStroke[];
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  aspectRatio: number;
  now?: () => Date;
};

export type CreateEphemeralDrawingResult =
  | { ok: true; drawing: EphemeralDrawingObject }
  | { ok: false; error: string };

export function createEphemeralDrawingObject(
  input: CreateEphemeralDrawingInput,
): CreateEphemeralDrawingResult {
  if (!isUuid(input.drawingId) || !isUuid(input.ownerSessionId)) {
    return { ok: false, error: "Invalid drawing." };
  }
  if (!hasMeaningfulStrokes(input.strokes)) {
    return { ok: false, error: "Draw something first." };
  }
  if (input.strokes.length > DRAWING_MAX_STROKES) {
    return { ok: false, error: "Too many strokes." };
  }
  if (countDrawingPoints(input.strokes) > DRAWING_MAX_TOTAL_POINTS) {
    return { ok: false, error: "Drawing is too large." };
  }
  for (const stroke of input.strokes) {
    if (!isDrawingColour(stroke.colour)) {
      return { ok: false, error: "Invalid colour." };
    }
    if (
      stroke.points.length === 0 ||
      stroke.points.length > DRAWING_MAX_POINTS_PER_STROKE
    ) {
      return { ok: false, error: "Invalid stroke." };
    }
  }

  const widthPct = clampSizePct(input.widthPct, DRAWING_ZONE_WIDTH_PCT);
  const heightPct = clampSizePct(input.heightPct, DRAWING_ZONE_HEIGHT_PCT);
  const aspectRatio = resolveDrawingAspectRatio({
    aspectRatio: input.aspectRatio,
    widthPct,
    heightPct,
  });
  if (aspectRatio === null) {
    return { ok: false, error: "Invalid aspect ratio." };
  }

  const now = input.now ?? (() => new Date());
  return {
    ok: true,
    drawing: {
      drawingId: normalizeSessionId(input.drawingId),
      ownerSessionId: normalizeSessionId(input.ownerSessionId),
      strokes: input.strokes.map((stroke) => ({
        colour: stroke.colour,
        points: stroke.points.map((p) => ({
          x: clamp01(p.x),
          y: clamp01(p.y),
        })),
      })),
      leftPct: clampCanvasPct(input.leftPct),
      topPct: clampCanvasPct(input.topPct),
      widthPct,
      heightPct,
      aspectRatio,
      createdAt: now().toISOString(),
    },
  };
}

export function upsertEphemeralDrawing(
  data: EphemeralDrawingsPageData,
  drawing: EphemeralDrawingObject,
): EphemeralDrawingsPageData {
  const without = data.drawings.filter(
    (d) => d.drawingId !== drawing.drawingId,
  );
  return { drawings: [...without, drawing] };
}

export function removeEphemeralDrawing(
  data: EphemeralDrawingsPageData,
  drawingId: string,
): EphemeralDrawingsPageData {
  return {
    drawings: data.drawings.filter((d) => d.drawingId !== drawingId),
  };
}

export function removeEphemeralDrawingsByOwner(
  data: EphemeralDrawingsPageData,
  ownerSessionId: string,
): EphemeralDrawingsPageData {
  const owner = normalizeSessionId(ownerSessionId);
  return {
    drawings: data.drawings.filter((d) => d.ownerSessionId !== owner),
  };
}

export function retainEphemeralDrawingsForPresentOwners(
  data: EphemeralDrawingsPageData,
  presentSessionIds: ReadonlySet<string>,
): EphemeralDrawingsPageData {
  return {
    drawings: data.drawings.filter((d) =>
      presentSessionIds.has(d.ownerSessionId),
    ),
  };
}

/** SVG polyline points string from normalized strokes (0–1 → 0–100 viewBox). */
export function strokeToSvgPoints(points: readonly DrawingPoint[]): string {
  return points
    .map((p) => `${(clamp01(p.x) * 100).toFixed(2)},${(clamp01(p.y) * 100).toFixed(2)}`)
    .join(" ");
}

export function shouldAppendDrawingPoint(
  last: DrawingPoint | null,
  next: DrawingPoint,
  minDelta: number = DRAWING_POINT_MIN_DELTA,
): boolean {
  if (!last) return true;
  const dx = next.x - last.x;
  const dy = next.y - last.y;
  return dx * dx + dy * dy >= minDelta * minDelta;
}
