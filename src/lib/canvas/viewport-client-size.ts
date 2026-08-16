/**
 * Measured canvas viewport size. Prefer the laid-out container over
 * window.innerHeight / dvh assumptions (older Safari toolbar geometry).
 */

export type ViewportClientSize = {
  width: number;
  height: number;
};

function positiveSize(width: number, height: number): ViewportClientSize | null {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1
  ) {
    return null;
  }
  return { width, height };
}

/**
 * Read the canvas viewport box. Ignores 0×0 (unsettled layout). Falls back to
 * getBoundingClientRect when clientWidth/Height have not been written yet.
 */
export function readViewportClientSize(
  element: {
    clientWidth?: number;
    clientHeight?: number;
    getBoundingClientRect?: () => { width: number; height: number };
  } | null,
): ViewportClientSize | null {
  if (!element) return null;

  const fromClient = positiveSize(
    element.clientWidth ?? 0,
    element.clientHeight ?? 0,
  );
  if (fromClient) return fromClient;

  if (typeof element.getBoundingClientRect !== "function") return null;
  const rect = element.getBoundingClientRect();
  return positiveSize(rect.width, rect.height);
}

/**
 * First positive container box frames HOME. Later size changes only clamp.
 * 0×0 (unsettled Safari layout) waits instead of framing a 1×1 world crop.
 */
export function nextViewportCameraAction(
  alreadyFramed: boolean,
  size: ViewportClientSize | null,
): "wait" | "initial-home" | "clamp" {
  if (!size) return "wait";
  return alreadyFramed ? "clamp" : "initial-home";
}
