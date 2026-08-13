"use client";

/**
 * Canonical brand H1 + subtitle (IC3.9).
 *
 * These are local launch anchors — not PlayHTML `can-move` targets.
 * Shared room can-move on other canvas objects is unchanged.
 * Opening the site never writes PlayHTML / Yjs / PartyKit for brand.
 */

import {
  HERO_SUBTITLE_DEFAULT_STYLE,
  HERO_TITLE_DEFAULT_STYLE,
  PLAYHTML_HERO_SUBTITLE_ID,
  PLAYHTML_HERO_TITLE_ID,
} from "@/lib/canvas/hero";

export function MovableHero() {
  return (
    <>
      <div
        id={PLAYHTML_HERO_TITLE_ID}
        className="pointer-events-none absolute z-[15] select-none"
        style={HERO_TITLE_DEFAULT_STYLE}
        data-4663-hero-title
        data-4663-brand-anchor="title"
      >
        <h1 className="-translate-x-1/2 -translate-y-1/2 text-5xl font-semibold tracking-tight text-[color:var(--canvas-fg,#171717)] sm:text-6xl">
          4663
        </h1>
      </div>

      <div
        id={PLAYHTML_HERO_SUBTITLE_ID}
        className="pointer-events-none absolute z-[15] max-w-[16rem] select-none sm:max-w-none"
        style={HERO_SUBTITLE_DEFAULT_STYLE}
        data-4663-hero-subtitle
        data-4663-brand-anchor="subtitle"
      >
        <p className="-translate-x-1/2 text-center font-mono text-[11px] leading-snug tracking-wide text-[color:var(--canvas-muted,#a3a3a3)] sm:text-xs">
          the live canvas for robinhood chain
        </p>
      </div>
    </>
  );
}
