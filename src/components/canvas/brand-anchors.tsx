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

/**
 * H1 + subtitle — static layout grouping only (not a world/movable object).
 * Independent absolute origins so H1 stays optically at ~42% and subtitle at ~52%.
 */
export function BrandHero() {
  return (
    <div data-4663-brand-hero-stack className="contents">
      <div
        id={PLAYHTML_HERO_TITLE_ID}
        className="pointer-events-none absolute left-1/2 top-[42%] z-[1] -translate-x-1/2 -translate-y-1/2 select-none px-4"
        style={BRAND_TITLE_STYLE}
        data-4663-hero-title
        data-4663-brand-anchor="title"
      >
        <h1 className="text-center text-5xl font-semibold tracking-tight text-[color:var(--canvas-fg,#171717)] sm:text-6xl">
          {BRAND_HERO_TITLE}
        </h1>
      </div>
      <div
        id={PLAYHTML_HERO_SUBTITLE_ID}
        className="pointer-events-none absolute left-1/2 top-[52%] z-[1] max-w-[16rem] -translate-x-1/2 select-none px-4 sm:max-w-none"
        style={BRAND_SUBTITLE_STYLE}
        data-4663-hero-subtitle
        data-4663-brand-anchor="subtitle"
      >
        <p className="text-center font-mono text-[11px] leading-snug tracking-wide text-[color:var(--canvas-muted,#a3a3a3)] sm:text-xs">
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
