/**
 * Viewport-space empty-canvas tap samples.
 * Classification is uniform: empty-hit, or the viewport/world shell itself
 * when overflow+transform hit-testing misses the transformed descendant.
 */

export type CanvasViewportTapSampleId =
  | "centre"
  | "top-edge"
  | "bottom-edge"
  | "left-edge"
  | "right-edge"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type CanvasViewportTapSample = {
  id: CanvasViewportTapSampleId;
  xFrac: number;
  yFrac: number;
};

/** Inclusive of edges/corners of the usable viewport (not chrome insets). */
export const CANVAS_VIEWPORT_TAP_SAMPLES: readonly CanvasViewportTapSample[] = [
  { id: "centre", xFrac: 0.5, yFrac: 0.5 },
  { id: "top-edge", xFrac: 0.5, yFrac: 0.005 },
  { id: "bottom-edge", xFrac: 0.5, yFrac: 0.995 },
  { id: "left-edge", xFrac: 0.005, yFrac: 0.5 },
  { id: "right-edge", xFrac: 0.995, yFrac: 0.5 },
  { id: "top-left", xFrac: 0.005, yFrac: 0.005 },
  { id: "top-right", xFrac: 0.995, yFrac: 0.005 },
  { id: "bottom-left", xFrac: 0.005, yFrac: 0.995 },
  { id: "bottom-right", xFrac: 0.995, yFrac: 0.995 },
];

export function viewportTapClientPoint(
  sample: CanvasViewportTapSample,
  viewport: { left: number; top: number; width: number; height: number },
): { clientX: number; clientY: number } {
  return {
    clientX: viewport.left + viewport.width * sample.xFrac,
    clientY: viewport.top + viewport.height * sample.yFrac,
  };
}
