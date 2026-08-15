"use client";

/**
 * Opaque pointer-events fill so decorative `pointer-events-none` children
 * cannot punch hits through a PlayHTML host to an object stacked below.
 * Place behind nested controls (`relative z-[1]` on the control).
 */

export function PlayhtmlMoveHitFill() {
  return (
    <div
      aria-hidden
      className="pointer-events-auto absolute inset-0 z-0"
      data-4663-playhtml-move-hit="true"
    />
  );
}
