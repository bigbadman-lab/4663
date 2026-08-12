"use client";

/**
 * Quiet edge chrome: brand identity + live presence.
 * Not a navbar / hero / marketing header.
 */

import { PresenceStatus } from "@/components/presence-status";

export function CanvasChrome() {
  return (
    <header
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-6 px-4 pt-4 sm:px-6 sm:pt-5"
      data-4663-canvas-chrome
    >
      <div className="pointer-events-auto max-w-[14rem] select-none">
        <p className="text-sm font-medium tracking-tight text-neutral-900">
          4663
        </p>
        <p className="mt-0.5 font-mono text-[10px] leading-snug tracking-wide text-neutral-400">
          live intelligence for robinhood chain
        </p>
      </div>
      <div className="pointer-events-auto max-w-[16rem] shrink-0">
        <PresenceStatus />
      </div>
    </header>
  );
}
