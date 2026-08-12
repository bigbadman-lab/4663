"use client";

/**
 * Quiet edge chrome: genuine presence only.
 * Brand identity lives on the movable PlayHTML hero.
 */

import { PresenceStatus } from "@/components/presence-status";

export function CanvasChrome() {
  return (
    <header
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-end gap-6 px-4 pt-4 sm:px-6 sm:pt-5"
      data-4663-canvas-chrome
    >
      <div className="pointer-events-auto max-w-[16rem] shrink-0">
        <PresenceStatus />
      </div>
    </header>
  );
}
