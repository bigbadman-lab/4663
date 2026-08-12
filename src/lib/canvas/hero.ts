/**
 * Stable PlayHTML identities and default hero origins for Stage 10B.5.
 * Positions are CSS origins; PlayHTML persists translate(x,y) offsets from these.
 */

export const PLAYHTML_CANVAS_BOUNDS_ID = "4663-canvas" as const;
export const PLAYHTML_HERO_TITLE_ID = "4663-hero-title" as const;
export const PLAYHTML_HERO_SUBTITLE_ID = "4663-hero-subtitle" as const;

/** CSS origin for title — viewport midpoint, slightly above optical center. */
export const HERO_TITLE_DEFAULT_STYLE = {
  left: "50%",
  top: "42%",
} as const;

/** CSS origin for subtitle — directly under the title origin. */
export const HERO_SUBTITLE_DEFAULT_STYLE = {
  left: "50%",
  top: "52%",
} as const;
