/**
 * Local-only hero appearance preferences (per browser / device).
 * Never synced via PlayHTML, Supabase, presence, or collaborative state.
 *
 * Clickable H1 colour cycling uses the canonical DRAW palette
 * (`DRAWING_COLOUR_PALETTE`) — same source as OBJECT and BRUSH.
 * `"default"` is the initial canvas-tone look, not a palette swatch.
 */

import {
  DRAWING_COLOUR_PALETTE,
  isDrawingColour,
  type DrawingColour,
} from "@/lib/social/draw-colours";

export const HERO_PREFERENCES_STORAGE_KEY = "4663:hero-preferences" as const;

/** Same reference as DRAW OBJECT/BRUSH — do not duplicate hex values here. */
export const HERO_COLORS = DRAWING_COLOUR_PALETTE;

export type HeroColor = "default" | DrawingColour;

export type HeroPreferences = {
  color: HeroColor;
  visible: boolean;
};

export const DEFAULT_HERO_PREFERENCES: HeroPreferences = {
  color: "default",
  visible: true,
};

export function isHeroColor(value: unknown): value is HeroColor {
  return value === "default" || isDrawingColour(value);
}

export function normalizeHeroPreferences(value: unknown): HeroPreferences {
  if (value == null || typeof value !== "object") {
    return { ...DEFAULT_HERO_PREFERENCES };
  }
  const record = value as Record<string, unknown>;
  return {
    color: isHeroColor(record.color)
      ? record.color
      : DEFAULT_HERO_PREFERENCES.color,
    visible:
      typeof record.visible === "boolean"
        ? record.visible
        : DEFAULT_HERO_PREFERENCES.visible,
  };
}

export function nextHeroColor(color: HeroColor): DrawingColour {
  if (!isDrawingColour(color)) {
    return HERO_COLORS[0]!;
  }
  return HERO_COLORS[(HERO_COLORS.indexOf(color) + 1) % HERO_COLORS.length]!;
}

export function readHeroPreferences(
  storage: Pick<Storage, "getItem"> | null | undefined = typeof window !==
    "undefined"
    ? window.localStorage
    : null,
): HeroPreferences {
  if (!storage) return { ...DEFAULT_HERO_PREFERENCES };
  try {
    const raw = storage.getItem(HERO_PREFERENCES_STORAGE_KEY);
    if (raw == null || raw === "") return { ...DEFAULT_HERO_PREFERENCES };
    return normalizeHeroPreferences(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_HERO_PREFERENCES };
  }
}

export function writeHeroPreferences(
  preferences: HeroPreferences,
  storage: Pick<Storage, "setItem"> | null | undefined = typeof window !==
  "undefined"
    ? window.localStorage
    : null,
): void {
  if (!storage) return;
  const next = normalizeHeroPreferences(preferences);
  try {
    storage.setItem(HERO_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota / private mode — preference stays in-memory only.
  }
}

/** Inline colour for title + subtitle when not using canvas tone defaults. */
export function heroTextColorStyle(
  color: HeroColor,
): { color: string } | undefined {
  if (color === "default") return undefined;
  return { color };
}
