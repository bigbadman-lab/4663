"use client";

/**
 * Independently movable PlayHTML hero title + subtitle.
 * Default CSS origins form a centered composition; persisted offsets override.
 */

import { CanMoveElement } from "@playhtml/react";
import {
  HERO_SUBTITLE_DEFAULT_STYLE,
  HERO_TITLE_DEFAULT_STYLE,
  PLAYHTML_CANVAS_BOUNDS_ID,
  PLAYHTML_HERO_SUBTITLE_ID,
  PLAYHTML_HERO_TITLE_ID,
} from "@/lib/canvas/hero";

export function MovableHero() {
  return (
    <>
      <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
        <div
          id={PLAYHTML_HERO_TITLE_ID}
          className="absolute z-[15] cursor-grab touch-manipulation select-none active:cursor-grabbing"
          style={HERO_TITLE_DEFAULT_STYLE}
          data-4663-hero-title
        >
          <h1 className="-translate-x-1/2 -translate-y-1/2 text-5xl font-semibold tracking-tight text-[color:var(--canvas-fg,#171717)] sm:text-6xl">
            4663
          </h1>
        </div>
      </CanMoveElement>

      <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
        <div
          id={PLAYHTML_HERO_SUBTITLE_ID}
          className="absolute z-[15] max-w-[16rem] cursor-grab touch-manipulation select-none active:cursor-grabbing sm:max-w-none"
          style={HERO_SUBTITLE_DEFAULT_STYLE}
          data-4663-hero-subtitle
        >
          <p className="-translate-x-1/2 text-center font-mono text-[11px] leading-snug tracking-wide text-[color:var(--canvas-muted,#a3a3a3)] sm:text-xs">
            the live canvas for robinhood chain
          </p>
        </div>
      </CanMoveElement>
    </>
  );
}
