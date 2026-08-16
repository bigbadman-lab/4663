/**
 * Shared interactive-target detection + PlayHTML nested-control protection.
 *
 * PlayHTML attaches a *native* bubble-phase `touchstart` on the movable host and
 * calls `preventDefault()` immediately, which cancels mobile click synthesis.
 * React 17+ delegates `onTouchStart` to the root, so it runs *after* that host
 * listener — `stopPropagation` in React props is too late on mobile.
 *
 * Fix: native capture-phase `stopPropagation` on the interactive child so the
 * host never sees touchstart/mousedown/pointerdown. Do not call preventDefault
 * here — the business action stays on `click`.
 *
 * Canvas pan uses the same semantic target rule so overlay controls (ENTER,
 * dock, hero) are never classified as empty-canvas gestures.
 */

export const INTERACTIVE_CONTROL_ATTR = "data-4663-interactive-control" as const;

export const INTERACTIVE_CONTROL_SELECTOR =
  `[${INTERACTIVE_CONTROL_ATTR}]` as const;

/**
 * Semantic + explicit interactive targets. Nested children match via closest().
 * Keep this as the single pan/drag exclusion selector — do not duplicate.
 */
export const INTERACTIVE_CANVAS_TARGET_SELECTOR = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "label",
  "summary",
  "[role='button']",
  "[role='link']",
  "[role='menuitem']",
  "[contenteditable='true']",
  "[contenteditable='']",
  INTERACTIVE_CONTROL_SELECTOR,
].join(",") as string;

/** Overlay chrome / dock — geometry fallback when hit-testing misses pe-auto islands. */
export const OVERLAY_INTERACTIVE_ROOT_SELECTOR =
  "[data-4663-canvas-chrome], [data-4663-control-dock]" as const;

const MOVE_START_EVENTS = [
  "touchstart",
  "mousedown",
  "pointerdown",
] as const;

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
  const el = asClosestElement(target);
  if (!el) return false;
  return Boolean(el.closest(INTERACTIVE_CONTROL_SELECTOR));
}

/**
 * True when the event target is (or is inside) a control that must own the
 * pointer: native form/chrome controls, explicit 4663 opt-outs, or either.
 */
export function isInteractiveCanvasTarget(
  target: EventTarget | null,
): boolean {
  const el = asClosestElement(target);
  if (!el) return false;
  return Boolean(el.closest(INTERACTIVE_CANVAS_TARGET_SELECTOR));
}

function pointInRect(
  x: number,
  y: number,
  rect: { left: number; right: number; top: number; bottom: number },
): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * Topmost overlay (chrome / dock) interactive element at a client point.
 * Prefers document.elementsFromPoint; falls back to layout boxes so taps that
 * miss buggy hit-testing through pointer-events:none ancestors still match.
 */
export function overlayInteractiveTargetFromPoint(
  clientX: number,
  clientY: number,
  searchRoot: ParentNode | null | undefined,
): Element | null {
  if (!searchRoot || typeof searchRoot.querySelectorAll !== "function") {
    return null;
  }

  const doc =
    searchRoot &&
    typeof (searchRoot as { elementsFromPoint?: unknown }).elementsFromPoint ===
      "function"
      ? (searchRoot as Document)
      : searchRoot &&
          typeof (searchRoot as { ownerDocument?: Document | null })
            .ownerDocument?.elementsFromPoint === "function"
        ? (searchRoot as { ownerDocument: Document }).ownerDocument
        : null;

  if (doc && typeof doc.elementsFromPoint === "function") {
    for (const node of doc.elementsFromPoint(clientX, clientY)) {
      if (!asClosestElement(node)?.closest(OVERLAY_INTERACTIVE_ROOT_SELECTOR)) {
        continue;
      }
      if (isInteractiveCanvasTarget(node)) {
        return (
          (node as Element).closest(INTERACTIVE_CANVAS_TARGET_SELECTOR) ?? node
        );
      }
    }
  }

  const roots = searchRoot.querySelectorAll(OVERLAY_INTERACTIVE_ROOT_SELECTOR);
  let match: Element | null = null;
  for (const root of roots) {
    const candidates = root.querySelectorAll(INTERACTIVE_CANVAS_TARGET_SELECTOR);
    for (const el of candidates) {
      if (typeof el.getBoundingClientRect !== "function") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (!pointInRect(clientX, clientY, rect)) continue;
      match = el;
    }
  }
  return match
    ? (match.closest(INTERACTIVE_CANVAS_TARGET_SELECTOR) ?? match)
    : null;
}

export function activateOverlayInteractiveTarget(element: Element): void {
  const clickable =
    element.closest(INTERACTIVE_CANVAS_TARGET_SELECTOR) ?? element;
  const click = (clickable as { click?: () => void }).click;
  if (typeof click === "function") {
    click.call(clickable);
  }
}
