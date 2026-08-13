/**
 * Social 8A / 8A.1 — bridge so the bottom dock can open existing TEXT/DRAW/MARK
 * create flows without a new placement-mode architecture.
 *
 * Empty-canvas path: click → menu → compose/draw/mark at clicked world %.
 * Dock TEXT/DRAW: open at a viewport-relative point mapped through the local camera.
 * Dock MARK (dormant): still uses DOCK_CREATE_DEFAULT_ORIGIN as a HOME-oriented cue.
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
 * Legacy HOME-oriented % constant (hero-clearance cue at 68/35 of the artboard).
 * IC2 dock TEXT/DRAW no longer apply this directly as world % — they map the
 * current viewport through screen→world helpers. MARK dock may still convert
 * this via homePctToWorldPct while MARK stays dormant.
 */
export const DOCK_CREATE_DEFAULT_ORIGIN = {
  leftPct: 68,
  topPct: 35,
} as const;

/** @deprecated Prefer DOCK_CREATE_DEFAULT_ORIGIN — Social 8A name. */
export const DOCK_CREATE_DEFAULT_PCT = DOCK_CREATE_DEFAULT_ORIGIN;

type EmptyCanvasClickHandler = (event: MouseEvent) => void;

let emptyCanvasClickHandler: EmptyCanvasClickHandler | null = null;

export function registerEmptyCanvasClick(
  handler: EmptyCanvasClickHandler,
): () => void {
  emptyCanvasClickHandler = handler;
  return () => {
    if (emptyCanvasClickHandler === handler) emptyCanvasClickHandler = null;
  };
}

export function dispatchEmptyCanvasClick(event: MouseEvent): void {
  emptyCanvasClickHandler?.(event);
}
