/**
 * Shared PlayHTML movable-host interaction: solid hit targeting, session
 * foreground z-order, and pointer capture for the duration of a drag.
 *
 * PlayHTML can-move listens for bubble-phase mousedown/touchstart on the host
 * and then document mousemove — it does not raise z-index or capture the
 * pointer. Decorative `pointer-events-none` children punch holes through the
 * host so overlapping objects (or the empty-hit pan layer) steal the next
 * pointerdown. This module closes that hole without changing PlayHTML data.
 */

import { isInteractiveCanvasTarget } from "@/lib/canvas/interactive-control";

/** Session-only; competes with sibling hosts inside the same stacking context. */
export const PLAYHTML_MOVE_FOREGROUND_Z_INDEX = 50 as const;

export const PLAYHTML_MOVE_FOREGROUND_ATTR =
  "data-4663-playhtml-move-foreground" as const;

export const PLAYHTML_MOVE_HIT_ATTR = "data-4663-playhtml-move-hit" as const;

export function shouldBeginPlayhtmlMoveForeground(
  target: EventTarget | null,
): boolean {
  return !isInteractiveCanvasTarget(target);
}

export function applyPlayhtmlMoveForeground(element: HTMLElement): void {
  element.style.zIndex = String(PLAYHTML_MOVE_FOREGROUND_Z_INDEX);
  element.setAttribute(PLAYHTML_MOVE_FOREGROUND_ATTR, "true");
}

export function capturePlayhtmlMovePointer(
  element: HTMLElement,
  pointerId: number,
): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // setPointerCapture can throw if the pointer is already released.
  }
}

export function releasePlayhtmlMovePointer(
  element: HTMLElement,
  pointerId: number,
): void {
  try {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // Already released / not a capturing element.
  }
}

export function beginPlayhtmlMoveForeground(
  element: HTMLElement,
  input: { target: EventTarget | null; pointerId: number },
): boolean {
  if (!shouldBeginPlayhtmlMoveForeground(input.target)) return false;
  applyPlayhtmlMoveForeground(element);
  capturePlayhtmlMovePointer(element, input.pointerId);
  return true;
}
