/**
 * Brand-anchor identities and viewport presentation (IC3.10).
 *
 * Logo / H1 / subtitle are independent viewport-fixed anchors — not world
 * objects and not PlayHTML can-move targets. Ids are retained for DOM
 * stability; orphaned historical can-move records remain inert.
 */

export {
  PLAYHTML_CANVAS_BOUNDS_ID,
  PLAYHTML_WORLD_BOUNDS_ID,
} from "@/lib/canvas/world-camera";

/** DOM ids (legacy PlayHTML names; not can-move targets). */
export const PLAYHTML_HERO_TITLE_ID = "4663-hero-title" as const;
export const PLAYHTML_HERO_SUBTITLE_ID = "4663-hero-subtitle" as const;
export const PLAYHTML_LOGO_ID = "4663-logo" as const;

/** Stable PlayHTML element id for a live public event object. */
export function playhtmlEventElementId(eventId: string): string {
  return `4663-event-${eventId}`;
}

export const BRAND_HERO_TITLE = "4663" as const;
export const BRAND_HERO_SUBTITLE =
  "THE LIVE CANVAS FOR ROBINHOOD CHAIN" as const;

/**
 * @deprecated IC3.10 — brand is viewport-fixed; kept for tests that assert
 * historical home-region percentage origins.
 */
export const HERO_TITLE_DEFAULT_STYLE = {
  left: "50%",
  top: "42%",
} as const;

/**
 * @deprecated IC3.10 — brand is viewport-fixed; kept for composition tests.
 */
export const HERO_SUBTITLE_DEFAULT_STYLE = {
  left: "50%",
  top: "52%",
} as const;

/**
 * Fixed chrome participation control ([ ENTER ] / [ NAME ]).
 * Anchored under the viewport subtitle — clear of brand copy on desktop/mobile.
 */
export const PARTICIPATION_CONTROL_DEFAULT_STYLE = {
  left: "50%",
  // Subtitle origin is 52%; clear 1–2 mono lines + gap (wraps on narrow widths).
  top: "calc(52% + 2.75rem)",
} as const;

/**
 * @deprecated IC3.10 — logo uses BRAND_LOGO_STYLE (safe-area). Kept for tests.
 */
export const LOGO_DEFAULT_STYLE = {
  left: "24px",
  top: "24px",
} as const;

/** Viewport logo — top-left with safe-area inset. */
export const BRAND_LOGO_STYLE = {
  left: "max(24px, env(safe-area-inset-left, 0px))",
  top: "max(24px, env(safe-area-inset-top, 0px))",
} as const;

/** Title sits in the BrandHero stack (centered); no absolute offsets. */
export const BRAND_TITLE_STYLE = {} as const;

/** Subtitle sits under the title in the BrandHero stack. */
export const BRAND_SUBTITLE_STYLE = {} as const;

export const PLAYHTML_CONTROL_PALETTE_ID = "4663-control-palette" as const;

/** CSS origin for control palette — bottom-center, above footer chrome. */
export const CONTROL_PALETTE_DEFAULT_STYLE = {
  left: "50%",
  bottom: "52px",
} as const;
