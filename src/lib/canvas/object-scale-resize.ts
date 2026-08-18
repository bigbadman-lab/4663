/**
 * Shared proportional object-resize session (TEXT / DRAW).
 * Top-left stays fixed; bottom-right follows the pointer; aspect is preserved
 * by applying a uniform scale. Pointer-up commits the last sample.
 */

export function clampObjectScale(
  value: number,
  minScale: number,
  maxScale: number,
  fallback = 1,
): number {
  const min = Number.isFinite(minScale) && minScale > 0 ? minScale : 0.01;
  const max = Number.isFinite(maxScale) ? Math.max(min, maxScale) : min;
  const raw = Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, raw));
}

/**
 * Uniform scale from a bottom-right drag.
 * Uses the larger axis factor so the box grows to cover the pointer
 * while keeping the object's aspect ratio.
 */
export function objectScaleFromCornerDelta(input: {
  startWidthPx: number;
  startHeightPx: number;
  startScale: number;
  deltaX: number;
  deltaY: number;
  minScale: number;
  maxScale: number;
}): number {
  const width = Math.max(1e-6, input.startWidthPx);
  const height = Math.max(1e-6, input.startHeightPx);
  const deltaX = Number.isFinite(input.deltaX) ? input.deltaX : 0;
  const deltaY = Number.isFinite(input.deltaY) ? input.deltaY : 0;
  const factor = Math.max((width + deltaX) / width, (height + deltaY) / height);
  if (!Number.isFinite(factor) || factor <= 0) {
    return clampObjectScale(
      input.startScale,
      input.minScale,
      input.maxScale,
    );
  }
  return clampObjectScale(
    input.startScale * factor,
    input.minScale,
    input.maxScale,
  );
}

export type ObjectScaleResizeGesture = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startScale: number;
  startWidthPx: number;
  startHeightPx: number;
  minScale: number;
  maxScale: number;
  scale: number;
};

export function beginObjectScaleResize(input: {
  pointerId: number;
  clientX: number;
  clientY: number;
  scale: number;
  widthPx: number;
  heightPx: number;
  minScale: number;
  maxScale: number;
}): ObjectScaleResizeGesture {
  const scale = clampObjectScale(input.scale, input.minScale, input.maxScale);
  return {
    pointerId: input.pointerId,
    startClientX: input.clientX,
    startClientY: input.clientY,
    startScale: scale,
    startWidthPx: Math.max(1e-6, input.widthPx),
    startHeightPx: Math.max(1e-6, input.heightPx),
    minScale: input.minScale,
    maxScale: input.maxScale,
    scale,
  };
}

export function objectScaleFromPointer(input: {
  gesture: Pick<
    ObjectScaleResizeGesture,
    | "startScale"
    | "startWidthPx"
    | "startHeightPx"
    | "minScale"
    | "maxScale"
  >;
  deltaX: number;
  deltaY: number;
}): number {
  return objectScaleFromCornerDelta({
    startWidthPx: input.gesture.startWidthPx,
    startHeightPx: input.gesture.startHeightPx,
    startScale: input.gesture.startScale,
    deltaX: input.deltaX,
    deltaY: input.deltaY,
    minScale: input.gesture.minScale,
    maxScale: input.gesture.maxScale,
  });
}

export function moveObjectScaleResize(
  gesture: ObjectScaleResizeGesture,
  input: {
    pointerId: number;
    deltaX: number;
    deltaY: number;
  },
): ObjectScaleResizeGesture | null {
  if (input.pointerId !== gesture.pointerId) return null;
  return {
    ...gesture,
    scale: objectScaleFromPointer({
      gesture,
      deltaX: input.deltaX,
      deltaY: input.deltaY,
    }),
  };
}

/**
 * pointerup commits the event's last coordinates so the final delta is not lost.
 * pointercancel keeps the last moved scale and ignores possibly-zero coords.
 */
export function finishObjectScaleResize(
  gesture: ObjectScaleResizeGesture,
  input: {
    type: string;
    pointerId: number;
    deltaX: number;
    deltaY: number;
  },
): number {
  if (input.pointerId !== gesture.pointerId) return gesture.scale;
  if (input.type === "pointercancel") return gesture.scale;
  return objectScaleFromPointer({
    gesture,
    deltaX: input.deltaX,
    deltaY: input.deltaY,
  });
}
