/**
 * Explicit PlayHTML drag-handle targeting.
 *
 * Hosts that mark a visible strip with PLAYHTML_DRAG_HANDLE_ATTR only start
 * a move from that strip. Hosts without a handle keep full-box move
 * (TEXT / DRAW / TOKEN / LINK).
 */

function asClosestElement(target: EventTarget | null): Element | null {
  if (target == null || typeof target !== "object") return null;
  if (
    !("closest" in target) ||
    typeof (target as Element).closest !== "function"
  ) {
    return null;
  }
  return target as Element;
}

export const PLAYHTML_DRAG_HANDLE_ATTR =
  "data-4663-playhtml-drag-handle" as const;

export const PLAYHTML_DRAG_HANDLE_SELECTOR =
  `[${PLAYHTML_DRAG_HANDLE_ATTR}]` as const;

export function isPlayhtmlDragHandleTarget(
  target: EventTarget | null,
): boolean {
  const el = asClosestElement(target);
  if (!el) return false;
  return Boolean(el.closest(PLAYHTML_DRAG_HANDLE_SELECTOR));
}

export function playhtmlHostHasDragHandle(
  host: Element | null | undefined,
): boolean {
  if (!host || typeof host.querySelector !== "function") return false;
  return Boolean(host.querySelector(PLAYHTML_DRAG_HANDLE_SELECTOR));
}
