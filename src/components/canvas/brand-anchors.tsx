"use client";

/**
 * IC3.10 — independent viewport-fixed brand anchors.
 *
 * Logo, H1, and subtitle are NOT world objects:
 * - not PlayHTML can-move targets
 * - not under the camera transform
 * - not grouped as one draggable unit
 *
 * H1 + subtitle share only a static layout stack (presentation).
 * Collaborative canvas pans underneath.
 *
 * Local hero appearance (colour / hide) is per-device only — never shared.
 */

import Image from "next/image";
import {
  BRAND_HERO_SUBTITLE,
  BRAND_HERO_TITLE,
  BRAND_LOGO_STYLE,
  BRAND_SUBTITLE_STYLE,
  BRAND_TITLE_STYLE,
  PLAYHTML_HERO_SUBTITLE_ID,
  PLAYHTML_HERO_TITLE_ID,
  PLAYHTML_LOGO_ID,
} from "@/lib/canvas/hero";
import { heroTextColorStyle } from "@/lib/canvas/hero-preferences";
import { useHeroPreferences } from "@/lib/canvas/use-hero-preferences";

/** Top-left logo — viewport chrome, safe-area aware. */
export function BrandLogo() {
  return (
    <div
      id={PLAYHTML_LOGO_ID}
      className="pointer-events-none absolute z-[1] select-none"
      style={BRAND_LOGO_STYLE}
      data-4663-logo
      data-4663-brand-anchor="logo"
    >
      <div className="h-16 w-16 overflow-hidden rounded-[16px] sm:h-[72px] sm:w-[72px] sm:rounded-[18px]">
        <Image
          src="/4663pfp.png"
          alt="4663"
          width={72}
          height={72}
          className="pointer-events-none h-full w-full object-cover"
          draggable={false}
          priority
        />
      </div>
    </div>
  );
}

const HERO_SELECT_BUTTON =
  "pointer-events-auto touch-manipulation select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400";

const HERO_TOOL_BUTTON =
  "inline-flex min-h-11 items-center px-2 font-mono text-[10px] tracking-wide text-[color:var(--canvas-muted,#a3a3a3)] touch-manipulation transition-colors hover:text-[color:var(--canvas-fg,#171717)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 sm:text-[11px]";

/**
 * H1 + subtitle — static layout grouping only (not a world/movable object).
 * Independent absolute origins so H1 stays optically at ~42% and subtitle at ~52%.
 * Tap H1 to cycle local text colour; HIDE sits above the title (not collaborative).
 */
export function BrandHero() {
  const { preferences, cycleColor, hideHero } = useHeroPreferences();
  const colorStyle = heroTextColorStyle(preferences.color);
  const titleColorClass =
    preferences.color === "default"
      ? "text-[color:var(--canvas-fg,#171717)]"
      : "";
  const subtitleColorClass =
    preferences.color === "default"
      ? "text-[color:var(--canvas-muted,#a3a3a3)]"
      : "";

  if (!preferences.visible) {
    return null;
  }

  return (
    <div
      data-4663-brand-hero-stack
      className="pointer-events-none absolute inset-0 z-[1]"
    >
      <div
        id={PLAYHTML_HERO_TITLE_ID}
        className="absolute left-1/2 top-[42%] z-[1] w-full max-w-[min(100%,42rem)] -translate-x-1/2 -translate-y-1/2 px-4"
        style={BRAND_TITLE_STYLE}
        data-4663-hero-title
        data-4663-brand-anchor="title"
      >
        <div className="relative">
          <div
            className="pointer-events-auto absolute bottom-full left-1/2 z-[2] mb-1 flex -translate-x-1/2 items-center sm:mb-2"
            data-4663-hero-appearance-tools
          >
            <button
              type="button"
              className={HERO_TOOL_BUTTON}
              data-4663-hero-hide
              aria-label="Hide hero"
              onClick={() => hideHero()}
            >
              HIDE
            </button>
          </div>
          <button
            type="button"
            className={`${HERO_SELECT_BUTTON} w-full`}
            aria-label={`Cycle hero colour (current ${preferences.color})`}
            data-4663-hero-select="title"
            data-4663-hero-color-value={preferences.color}
            onClick={() => cycleColor()}
          >
            <h1
              className={`whitespace-pre-line text-center text-5xl font-semibold tracking-tight sm:text-6xl ${titleColorClass}`}
              style={colorStyle}
            >
              {BRAND_HERO_TITLE}
            </h1>
          </button>
        </div>
      </div>

      <div
        id={PLAYHTML_HERO_SUBTITLE_ID}
        className="pointer-events-none absolute left-1/2 top-[52%] z-[1] w-full max-w-[16rem] -translate-x-1/2 select-none px-4 sm:max-w-none"
        style={BRAND_SUBTITLE_STYLE}
        data-4663-hero-subtitle
        data-4663-brand-anchor="subtitle"
      >
        <p
          className={`text-center font-mono text-[11px] leading-snug tracking-wide sm:text-xs ${subtitleColorClass}`}
          style={colorStyle}
        >
          {BRAND_HERO_SUBTITLE}
        </p>
      </div>
    </div>
  );
}

/** Viewport-fixed brand layer (sibling of chrome controls / above world). */
export function BrandAnchors() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0"
      data-4663-brand-anchors
    >
      <BrandLogo />
      <BrandHero />
    </div>
  );
}
