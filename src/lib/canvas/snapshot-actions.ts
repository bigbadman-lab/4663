/**
 * SNAPSHOT action bridge — dock + keyboard both call the same registered action.
 * Do not duplicate capture orchestration here.
 */

export type SnapshotActions = {
  startCapture: () => void;
  isBusy: () => boolean;
};

export type SnapshotShortcutKeyEvent = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
  preventDefault: () => void;
};

let registered: SnapshotActions | null = null;

export function registerSnapshotActions(
  actions: SnapshotActions,
): () => void {
  registered = actions;
  const unbindShortcut = attachSnapshotShortcutListener();
  return () => {
    unbindShortcut();
    if (registered === actions) registered = null;
  };
}

export function getSnapshotActions(): SnapshotActions | null {
  return registered;
}

export function resolveSnapshotShortcutIsMac(
  platform = typeof navigator === "undefined" ? "" : navigator.platform,
): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

export function isSnapshotSaveShortcut(
  event: Pick<
    SnapshotShortcutKeyEvent,
    "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
  >,
  isMac = resolveSnapshotShortcutIsMac(),
): boolean {
  if (event.shiftKey || event.altKey) return false;
  if (event.key.toLowerCase() !== "s") return false;
  if (isMac) return event.metaKey === true && event.ctrlKey !== true;
  return event.ctrlKey === true && event.metaKey !== true;
}

export function isSnapshotTypingTarget(target: EventTarget | null): boolean {
  if (target == null || typeof target !== "object") return false;
  const el = target as {
    nodeType?: number;
    parentElement?: EventTarget | null;
    tagName?: string;
    isContentEditable?: boolean;
    closest?: (selector: string) => unknown;
    getAttribute?: (name: string) => string | null;
  };
  if (el.nodeType === 3) {
    return isSnapshotTypingTarget(el.parentElement ?? null);
  }
  const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable === true) return true;
  if (typeof el.closest === "function") {
    if (el.closest("input, textarea, select")) return true;
    const editable = el.closest("[contenteditable]") as {
      getAttribute?: (name: string) => string | null;
    } | null;
    if (
      editable &&
      editable.getAttribute?.("contenteditable") !== "false"
    ) {
      return true;
    }
  }
  return false;
}

export function handleSnapshotShortcutKeyDown(
  event: SnapshotShortcutKeyEvent,
  options?: {
    isMac?: boolean;
    actions?: SnapshotActions | null;
  },
): boolean {
  const isMac = options?.isMac ?? resolveSnapshotShortcutIsMac();
  if (!isSnapshotSaveShortcut(event, isMac)) return false;
  if (isSnapshotTypingTarget(event.target)) return false;
  event.preventDefault();
  const actions =
    options && "actions" in options ? options.actions : getSnapshotActions();
  if (!actions || actions.isBusy()) return true;
  actions.startCapture();
  return true;
}

export function attachSnapshotShortcutListener(
  target: Pick<Window, "addEventListener" | "removeEventListener"> | null = typeof window ===
  "undefined"
    ? null
    : window,
): () => void {
  if (!target) return () => {};
  const onKeyDown = (event: Event) => {
    handleSnapshotShortcutKeyDown(event as KeyboardEvent);
  };
  target.addEventListener("keydown", onKeyDown, true);
  return () => {
    target.removeEventListener("keydown", onKeyDown, true);
  };
}
