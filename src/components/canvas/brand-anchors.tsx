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
import { useEffect, useId, useRef, useState } from "react";
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
 * Tap toggles local COLOR · HIDE tools (not collaborative).
 */
export function BrandHero() {
  const { preferences, cycleColor, hideHero } = useHeroPreferences();
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const colorStyle = heroTextColorStyle(preferences.color);
  const titleColorClass =
    preferences.color === "default"
      ? "text-[color:var(--canvas-fg,#171717)]"
      : "";
  const subtitleColorClass =
    preferences.color === "default"
      ? "text-[color:var(--canvas-muted,#a3a3a3)]"
      : "";

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && !root.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen]);

  if (!preferences.visible) {
    return null;
  }

  const toggleMenu = () => setMenuOpen((value) => !value);

  return (
    <div
      ref={rootRef}
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
        <button
          type="button"
          className={`${HERO_SELECT_BUTTON} w-full`}
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          aria-label="Hero appearance"
          data-4663-hero-select="title"
          onClick={toggleMenu}
        >
          <h1
            className={`text-center text-5xl font-semibold tracking-tight sm:text-6xl ${titleColorClass}`}
            style={colorStyle}
          >
            {BRAND_HERO_TITLE}
          </h1>
        </button>
      </div>

      <div
        id={PLAYHTML_HERO_SUBTITLE_ID}
        className="absolute left-1/2 top-[52%] z-[1] w-full max-w-[16rem] -translate-x-1/2 px-4 sm:max-w-none"
        style={BRAND_SUBTITLE_STYLE}
        data-4663-hero-subtitle
        data-4663-brand-anchor="subtitle"
      >
        <button
          type="button"
          className={`${HERO_SELECT_BUTTON} mx-auto block w-full`}
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          aria-label="Hero appearance"
          data-4663-hero-select="subtitle"
          onClick={toggleMenu}
        >
          <p
            className={`text-center font-mono text-[11px] leading-snug tracking-wide sm:text-xs ${subtitleColorClass}`}
            style={colorStyle}
          >
            {BRAND_HERO_SUBTITLE}
          </p>
        </button>
      </div>

      {menuOpen ? (
        <div
          id={menuId}
          role="toolbar"
          aria-label="Hero appearance"
          className="pointer-events-auto absolute left-1/2 top-[calc(42%-3.25rem)] z-[2] flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5"
          data-4663-hero-appearance-tools
        >
          <button
            type="button"
            className={HERO_TOOL_BUTTON}
            data-4663-hero-color
            data-4663-hero-color-value={preferences.color}
            aria-label={`Cycle hero colour (current ${preferences.color})`}
            onClick={(event) => {
              event.stopPropagation();
              cycleColor();
            }}
          >
            COLOR
          </button>
          <span
            aria-hidden
            className="font-mono text-[10px] text-[color:var(--canvas-muted,#a3a3a3)] sm:text-[11px]"
          >
            ·
          </span>
          <button
            type="button"
            className={HERO_TOOL_BUTTON}
            data-4663-hero-hide
            aria-label="Hide hero"
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen(false);
              hideHero();
            }}
          >
            HIDE
          </button>
        </div>
      ) : null}
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
