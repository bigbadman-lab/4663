/**
 * IC3.5 — local-only HOME view restore bridge.
 * CanvasSurface registers goHome; SUMMON requests it after a successful write.
 * Never shared / never broadcast.
 */

type LocalHomeViewFn = () => void;

let registered: LocalHomeViewFn | null = null;

export function registerLocalHomeView(fn: LocalHomeViewFn): () => void {
  registered = fn;
  return () => {
    if (registered === fn) registered = null;
  };
}

export function requestLocalHomeView(): void {
  registered?.();
}

export function getLocalHomeView(): LocalHomeViewFn | null {
  return registered;
}
