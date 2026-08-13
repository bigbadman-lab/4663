/**
 * Stable PlayHTML identities and default hero origins for Stage 10B.5.
 * Positions are CSS origins; PlayHTML persists translate(x,y) offsets from these.
 * IC1: PlayHTML bounds are the fixed world (`PLAYHTML_WORLD_BOUNDS_ID`).
 */

export {
  PLAYHTML_CANVAS_BOUNDS_ID,
  PLAYHTML_WORLD_BOUNDS_ID,
} from "@/lib/canvas/world-camera";

export const PLAYHTML_HERO_TITLE_ID = "4663-hero-title" as const;
export const PLAYHTML_HERO_SUBTITLE_ID = "4663-hero-subtitle" as const;
export const PLAYHTML_LOGO_ID = "4663-logo" as const;

/** Stable PlayHTML element id for a live public event object. */
export function playhtmlEventElementId(eventId: string): string {
  return `4663-event-${eventId}`;
}

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

/**
 * Fixed chrome participation control ([ ENTER ] / [ NAME ]).
 * Anchored under the default hero/subtitle composition — not a PlayHTML child.
 */
export const PARTICIPATION_CONTROL_DEFAULT_STYLE = {
  left: "50%",
  top: "53.5%",
} as const;

/** CSS origin for logo — top-left; PlayHTML offsets from here. */
export const LOGO_DEFAULT_STYLE = {
  left: "24px",
  top: "24px",
} as const;

export const PLAYHTML_CONTROL_PALETTE_ID = "4663-control-palette" as const;

/** CSS origin for control palette — bottom-center, above footer chrome. */
export const CONTROL_PALETTE_DEFAULT_STYLE = {
  left: "50%",
  bottom: "52px",
} as const;
