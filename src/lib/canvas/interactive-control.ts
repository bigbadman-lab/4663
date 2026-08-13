/**
 * IC3.6 — nested interactive controls inside PlayHTML movable hosts.
 *
 * PlayHTML attaches a *native* bubble-phase `touchstart` on the movable host and
 * calls `preventDefault()` immediately, which cancels mobile click synthesis.
 * React 17+ delegates `onTouchStart` to the root, so it runs *after* that host
 * listener — `stopPropagation` in React props is too late on mobile.
 *
 * Fix: native capture-phase `stopPropagation` on the interactive child so the
 * host never sees touchstart/mousedown/pointerdown. Do not call preventDefault
 * here — the business action stays on `click`.
 */

export const INTERACTIVE_CONTROL_ATTR = "data-4663-interactive-control" as const;

export const INTERACTIVE_CONTROL_SELECTOR =
  `[${INTERACTIVE_CONTROL_ATTR}]` as const;

const MOVE_START_EVENTS = [
  "touchstart",
  "mousedown",
  "pointerdown",
] as const;

/** Shared stopPropagation helper (React props / optional parent wiring). */
export function stopPlayhtmlMoveStart(event: {
  stopPropagation(): void;
}): void {
  event.stopPropagation();
}

function stopNativeMoveStart(event: Event): void {
  event.stopPropagation();
}

/**
 * Bind capture-phase listeners so PlayHTML's host bubble listener never runs.
 * Returns an unbind function for effect cleanup.
 */
export function protectInteractiveControlElement(
  element: HTMLElement,
): () => void {
  element.setAttribute(INTERACTIVE_CONTROL_ATTR, "true");
  const options: AddEventListenerOptions = { capture: true };
  for (const type of MOVE_START_EVENTS) {
    element.addEventListener(type, stopNativeMoveStart, options);
  }
  return () => {
    for (const type of MOVE_START_EVENTS) {
      element.removeEventListener(type, stopNativeMoveStart, options);
    }
  };
}

/** True when the event target is (or is inside) a protected interactive control. */
export function isInteractiveCanvasControlTarget(
  target: EventTarget | null,
): boolean {
  if (target == null || typeof target !== "object") return false;
  if (
    !("closest" in target) ||
    typeof (target as Element).closest !== "function"
  ) {
    return false;
  }
  return Boolean(
    (target as Element).closest(INTERACTIVE_CONTROL_SELECTOR),
  );
}
