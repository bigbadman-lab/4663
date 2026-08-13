/**
 * Social 8A / 8A.1 — bridge so the bottom dock can open existing TEXT/DRAW/MARK
 * create flows without a new placement-mode architecture.
 *
 * Empty-canvas path: click → menu → compose/draw/mark at clicked %.
 * Dock path: openText/openDraw/openMark at DOCK_CREATE_DEFAULT_ORIGIN only.
 */

export type CanvasCreateActions = {
  openText: () => void;
  openDraw: () => void;
  openMark: () => void;
  canCreate: () => boolean;
  canMark: () => boolean;
};

let registered: CanvasCreateActions | null = null;

export function registerCanvasCreateActions(
  actions: CanvasCreateActions,
): () => void {
  registered = actions;
  return () => {
    if (registered === actions) registered = null;
  };
}

export function getCanvasCreateActions(): CanvasCreateActions | null {
  return registered;
}

/**
 * Safe default canvas % for dock-triggered create.
 *
 * Intentionally NOT hero center (hero H1 defaults to 50%/42%).
 * Target: right-of-center, mid-upper — clear of hero/H1/subtitle/name,
 * bottom dock, bottom-left presence, and bottom-right clock.
 */
export const DOCK_CREATE_DEFAULT_ORIGIN = {
  leftPct: 68,
  topPct: 35,
} as const;

/** @deprecated Prefer DOCK_CREATE_DEFAULT_ORIGIN — Social 8A name. */
export const DOCK_CREATE_DEFAULT_PCT = DOCK_CREATE_DEFAULT_ORIGIN;
