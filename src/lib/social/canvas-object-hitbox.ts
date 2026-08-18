/**
 * Tight TEXT / DRAW hit geometry for resize + overlap routing tests.
 * Host bounds must equal the visible object — not a larger empty rectangle.
 */

export type CanvasObjectHitRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type CanvasObjectHitPoint = {
  x: number;
  y: number;
};

export type CanvasObjectOverlapTarget = "object" | "other" | "empty";

export const OBJECT_RESIZE_HANDLE_PX = 28 as const;

export function pointInCanvasObjectRect(
  point: CanvasObjectHitPoint,
  rect: CanvasObjectHitRect,
): boolean {
  return (
    point.x >= rect.left &&
    point.x < rect.left + rect.width &&
    point.y >= rect.top &&
    point.y < rect.top + rect.height
  );
}

export function pointJustOutsideCanvasObject(
  rect: CanvasObjectHitRect,
  edge: "left" | "right" | "top" | "bottom",
  gap = 1,
): CanvasObjectHitPoint {
  const midX = rect.left + rect.width / 2;
  const midY = rect.top + rect.height / 2;
  if (edge === "left") return { x: rect.left - gap, y: midY };
  if (edge === "right") {
    return { x: rect.left + rect.width + gap - 1e-6, y: midY };
  }
  if (edge === "top") return { x: midX, y: rect.top - gap };
  return { x: midX, y: rect.top + rect.height + gap - 1e-6 };
}

/** Visible DRAW host: top-left origin, size = canonical ink box × scale. */
export function drawingVisibleRect(input: {
  left: number;
  top: number;
  width: number;
  height: number;
}): CanvasObjectHitRect {
  return {
    left: input.left,
    top: input.top,
    width: input.width,
    height: input.height,
  };
}

/**
 * TEXT is visually centered on its stored origin. Host must match the
 * scaled glyph box, not a larger unfilled rectangle.
 */
export function textCenteredVisibleRect(input: {
  originLeft: number;
  originTop: number;
  contentWidth: number;
  contentHeight: number;
  fontScale: number;
}): CanvasObjectHitRect {
  const width = input.contentWidth * input.fontScale;
  const height = input.contentHeight * input.fontScale;
  return {
    left: input.originLeft - width / 2,
    top: input.originTop - height / 2,
    width,
    height,
  };
}

/** Handle sits on the bottom-right, extra hit extends inward. */
export function objectResizeHandleRect(
  host: CanvasObjectHitRect,
  handlePx = OBJECT_RESIZE_HANDLE_PX,
): CanvasObjectHitRect {
  const size = Math.min(handlePx, host.width, host.height);
  return {
    left: host.left + host.width - size,
    top: host.top + host.height - size,
    width: size,
    height: size,
  };
}

export function canvasObjectOverlapHit(input: {
  object: CanvasObjectHitRect;
  other: CanvasObjectHitRect;
  point: CanvasObjectHitPoint;
}): CanvasObjectOverlapTarget {
  if (pointInCanvasObjectRect(input.point, input.object)) return "object";
  if (pointInCanvasObjectRect(input.point, input.other)) return "other";
  return "empty";
}

export function hostMatchesVisible(
  host: CanvasObjectHitRect,
  visible: CanvasObjectHitRect,
): boolean {
  return (
    host.left === visible.left &&
    host.top === visible.top &&
    host.width === visible.width &&
    host.height === visible.height
  );
}
