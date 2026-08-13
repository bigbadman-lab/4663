/**
 * Social 8A — bridge so the bottom dock can open existing TEXT/DRAW/MARK create flows
 * without a new placement-mode architecture (default center position).
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

/** Default canvas % for dock-triggered create (above bottom dock). */
export const DOCK_CREATE_DEFAULT_PCT = {
  leftPct: 50,
  topPct: 42,
} as const;
