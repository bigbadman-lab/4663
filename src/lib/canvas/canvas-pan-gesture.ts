/**
 * Empty-canvas pan gesture classification (Pointer Events).
 * Tracking starts on pointerdown; the gesture is not a pan until movement
 * crosses the shared drag threshold. Pointer capture / preventDefault are
 * only appropriate after that claim.
 */

import { isInteractiveCanvasTarget } from "@/lib/canvas/interactive-control";
import {
  isCanvasPanHitTarget,
  panDragThresholdPx,
} from "@/lib/canvas/world-camera";

export type CanvasPanGesture = {
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  active: boolean;
};

export type CanvasPanPointerInput = {
  isPrimary?: boolean;
  button?: number;
  createUiBlocksPan: boolean;
  target: EventTarget | null;
  overlayInteractive: Element | null;
};

/**
 * Older WebKit (Safari 15) may omit `isPrimary` or report `button === -1`
 * for the first touch contact. Treat those as a usable primary pointer.
 * Explicit `isPrimary === false` (non-primary finger) is still rejected.
 */
export function isUsableCanvasPointer(event: {
  isPrimary?: boolean;
  button?: number;
}): boolean {
  if (event.isPrimary === false) return false;
  const button = event.button;
  if (button == null || button === -1 || button === 0) return true;
  return false;
}

export function shouldTrackCanvasPan(input: CanvasPanPointerInput): boolean {
  if (!isUsableCanvasPointer(input)) return false;
  if (input.createUiBlocksPan) return false;
  if (input.overlayInteractive != null) return false;
  if (isInteractiveCanvasTarget(input.target)) return false;
  return isCanvasPanHitTarget(input.target);
}

export function createCanvasPanGesture(input: {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
}): CanvasPanGesture {
  return {
    pointerId: input.pointerId,
    pointerType: input.pointerType || "mouse",
    startX: input.clientX,
    startY: input.clientY,
    active: false,
  };
}

export function canvasPanMovementPx(
  gesture: Pick<CanvasPanGesture, "startX" | "startY">,
  clientX: number,
  clientY: number,
): number {
  return Math.hypot(clientX - gesture.startX, clientY - gesture.startY);
}

export function shouldPromoteCanvasPan(
  gesture: CanvasPanGesture,
  clientX: number,
  clientY: number,
): boolean {
  if (gesture.active) return false;
  return (
    canvasPanMovementPx(gesture, clientX, clientY) >=
    panDragThresholdPx(gesture.pointerType)
  );
}

/** True only after the drag threshold — capture/preventDefault belong here. */
export function canvasPanHasClaimedPointer(
  gesture: CanvasPanGesture | null | undefined,
): boolean {
  return gesture?.active === true;
}

export function shouldPreventDefaultForCanvasPan(
  gesture: CanvasPanGesture | null | undefined,
): boolean {
  return canvasPanHasClaimedPointer(gesture);
}

export function shouldActivateOverlayTargetOnRelease(input: {
  overlayElement: Element | null;
  pointerMovedPx: number;
  pointerType: string;
  eventTarget: EventTarget | null;
}): boolean {
  if (!input.overlayElement) return false;
  if (
    input.pointerMovedPx >= panDragThresholdPx(input.pointerType)
  ) {
    return false;
  }
  const target = input.eventTarget;
  if (
    target &&
    typeof (input.overlayElement as { contains?: (n: unknown) => boolean })
      .contains === "function" &&
    (input.overlayElement as { contains: (n: unknown) => boolean }).contains(
      target,
    )
  ) {
    return false;
  }
  return true;
}
