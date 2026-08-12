/**
 * Fixed 4663 participation colour palette.
 * Colour is assigned deterministically from participationSessionId.
 */

export const PARTICIPATION_COLOUR_PALETTE = [
  "#8FAE00",
  "#3B82F6",
  "#F59E0B",
  "#E11D48",
  "#0D9488",
  "#7C3AED",
  "#EA580C",
  "#2563EB",
] as const;

export type ParticipationColour =
  (typeof PARTICIPATION_COLOUR_PALETTE)[number];

export function isParticipationColour(
  value: unknown,
): value is ParticipationColour {
  return (
    typeof value === "string" &&
    (PARTICIPATION_COLOUR_PALETTE as readonly string[]).includes(value)
  );
}

/** Stable hash → palette index (FNV-1a 32-bit over session id). */
export function colourFromSessionId(sessionId: string): ParticipationColour {
  let hash = 0x811c9dc5;
  for (let i = 0; i < sessionId.length; i += 1) {
    hash ^= sessionId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const index =
    (hash >>> 0) % PARTICIPATION_COLOUR_PALETTE.length;
  return PARTICIPATION_COLOUR_PALETTE[index]!;
}
