/**
 * Tight DRAW / BRUSH object bounds from visible stroke ink.
 *
 * Authoring DRAW uses a large zone so the user has room to draw. After
 * publish, the PlayHTML host should match the ink — not the empty zone —
 * so nearby empty-canvas taps are not swallowed by an invisible hitbox.
 *
 * Padding is intentional interaction/render slop:
 * - stroke radius (round caps) so edges are not clipped
 * - antialiasing fringe
 * - a small grab target so thin lines stay draggable
 *
 * BRUSH strokes are already world %. DRAW strokes are 0–1 in the authoring
 * zone and are rebased into the tight box without changing world position.
 */

import {
  DRAWING_ASPECT_RATIO_MAX,
  DRAWING_ASPECT_RATIO_MIN,
  DRAWING_SIZE_PCT_MAX,
  DRAWING_SIZE_PCT_MIN,
  type DrawingStroke,
} from "@/lib/social/ephemeral-drawing";
import {
  BRUSH_STROKE_WIDTH_WORLD_PX,
  type BrushStroke,
} from "@/lib/social/ephemeral-brush";
import {
  WORLD_HEIGHT_PX,
  WORLD_WIDTH_PX,
  drawingZoneAspectFromWorldPct,
} from "@/lib/canvas/world-camera";

/**
 * Extra world-px padding beyond stroke radius.
 * ~12px ≈ stroke radius (~4.4px) + AA + a finger/mouse grab slop, without
 * restoring the authoring zone's empty interior.
 */
export const DRAWING_INK_PAD_WORLD_PX = 12 as const;

export type InkBoundsPct = {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
};

export type FittedDrawingInk = InkBoundsPct & {
  strokes: DrawingStroke[];
  aspectRatio: number;
};

function drawingInkPadWorldPct(): { x: number; y: number } {
  const pad = BRUSH_STROKE_WIDTH_WORLD_PX / 2 + DRAWING_INK_PAD_WORLD_PX;
  return {
    x: (pad / WORLD_WIDTH_PX) * 100,
    y: (pad / WORLD_HEIGHT_PX) * 100,
  };
}

function clampBoxToWorld(
  box: InkBoundsPct,
  maxPct: number,
): InkBoundsPct {
  let { leftPct, topPct, widthPct, heightPct } = box;
  widthPct = Math.min(maxPct, Math.max(DRAWING_SIZE_PCT_MIN, widthPct));
  heightPct = Math.min(maxPct, Math.max(DRAWING_SIZE_PCT_MIN, heightPct));
  if (leftPct < 0) leftPct = 0;
  if (topPct < 0) topPct = 0;
  if (leftPct + widthPct > 100) leftPct = Math.max(0, 100 - widthPct);
  if (topPct + heightPct > 100) topPct = Math.max(0, 100 - heightPct);
  return { leftPct, topPct, widthPct, heightPct };
}

/**
 * Expand a world-% AABB so thin lines stay clickable.
 * DRAW also keeps aspect in the persisted object range.
 */
export function constrainInkBounds(
  box: InkBoundsPct,
  options?: { maxPct?: number; clampAspect?: boolean },
): InkBoundsPct {
  const maxPct = options?.maxPct ?? DRAWING_SIZE_PCT_MAX;
  const clampAspect = options?.clampAspect !== false;
  let { leftPct, topPct, widthPct, heightPct } = box;
  const cx = leftPct + widthPct / 2;
  const cy = topPct + heightPct / 2;

  if (widthPct < DRAWING_SIZE_PCT_MIN) widthPct = DRAWING_SIZE_PCT_MIN;
  if (heightPct < DRAWING_SIZE_PCT_MIN) heightPct = DRAWING_SIZE_PCT_MIN;

  if (clampAspect) {
    const aspect = drawingZoneAspectFromWorldPct(widthPct, heightPct);
    if (aspect > DRAWING_ASPECT_RATIO_MAX) {
      const widthPx = (widthPct / 100) * WORLD_WIDTH_PX;
      const heightPx = widthPx / DRAWING_ASPECT_RATIO_MAX;
      heightPct = (heightPx / WORLD_HEIGHT_PX) * 100;
    } else if (aspect < DRAWING_ASPECT_RATIO_MIN) {
      const heightPx = (heightPct / 100) * WORLD_HEIGHT_PX;
      const widthPx = heightPx * DRAWING_ASPECT_RATIO_MIN;
      widthPct = (widthPx / WORLD_WIDTH_PX) * 100;
    }
  }

  leftPct = cx - widthPct / 2;
  topPct = cy - heightPct / 2;
  return clampBoxToWorld({ leftPct, topPct, widthPct, heightPct }, maxPct);
}

export function inkBoundsFromWorldPoints(
  points: readonly { x: number; y: number }[],
  pad = drawingInkPadWorldPct(),
  options?: { maxPct?: number; clampAspect?: boolean },
): InkBoundsPct | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return constrainInkBounds(
    {
      leftPct: minX - pad.x,
      topPct: minY - pad.y,
      widthPct: Math.max(0, maxX - minX) + pad.x * 2,
      heightPct: Math.max(0, maxY - minY) + pad.y * 2,
    },
    options,
  );
}

export function drawingPointToWorldPct(
  point: { x: number; y: number },
  geom: InkBoundsPct,
): { x: number; y: number } {
  return {
    x: geom.leftPct + point.x * geom.widthPct,
    y: geom.topPct + point.y * geom.heightPct,
  };
}

export function fitBrushInkBounds(
  strokes: readonly BrushStroke[],
): InkBoundsPct | null {
  const points: { x: number; y: number }[] = [];
  for (const stroke of strokes) {
    for (const point of stroke.points) points.push(point);
  }
  return inkBoundsFromWorldPoints(points, drawingInkPadWorldPct(), {
    maxPct: 100,
    clampAspect: false,
  });
}

/**
 * Rebase DRAW strokes into the minimal object rectangle that contains the
 * ink. World position of every point is preserved:
 *   oldOrigin + local * oldSize  ==  newOrigin + newLocal * newSize
 */
export function fitDrawingToVisibleInk(input: {
  strokes: readonly DrawingStroke[];
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}): FittedDrawingInk | null {
  const geom: InkBoundsPct = {
    leftPct: input.leftPct,
    topPct: input.topPct,
    widthPct: input.widthPct,
    heightPct: input.heightPct,
  };
  const points: { x: number; y: number }[] = [];
  for (const stroke of input.strokes) {
    for (const point of stroke.points) {
      points.push(drawingPointToWorldPct(point, geom));
    }
  }
  const box = inkBoundsFromWorldPoints(points);
  if (!box || box.widthPct <= 0 || box.heightPct <= 0) return null;

  const strokes = input.strokes.map((stroke) => ({
    colour: stroke.colour,
    points: stroke.points.map((point) => {
      const world = drawingPointToWorldPct(point, geom);
      return {
        x: (world.x - box.leftPct) / box.widthPct,
        y: (world.y - box.topPct) / box.heightPct,
      };
    }),
  }));

  return {
    ...box,
    strokes,
    aspectRatio: drawingZoneAspectFromWorldPct(box.widthPct, box.heightPct),
  };
}

/** Host size in world px — stroke width is stored in this space. */
export function drawingHostWorldSizePx(
  widthPct: number,
  heightPct: number,
): { width: number; height: number } {
  return {
    width: (WORLD_WIDTH_PX * widthPct) / 100,
    height: (WORLD_HEIGHT_PX * heightPct) / 100,
  };
}

export function drawingHostWorldSizeFromAspect(
  widthPct: number,
  aspectRatio: number,
): { width: number; height: number } {
  const width = (WORLD_WIDTH_PX * widthPct) / 100;
  const height = aspectRatio > 0 ? width / aspectRatio : width;
  return { width, height };
}

/** DRAWING_BRUSH_SIZE in a 0–100 viewBox of the canonical zone, as world px. */
export const DRAWING_STROKE_WIDTH_WORLD_PX = BRUSH_STROKE_WIDTH_WORLD_PX;
