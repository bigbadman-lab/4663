/**
 * Local-only hero appearance preferences (per browser / device).
 * Never synced via PlayHTML, Supabase, presence, or collaborative state.
 */

export const HERO_PREFERENCES_STORAGE_KEY = "4663:hero-preferences" as const;

export const HERO_COLORS = [
  "default",
  "slate",
  "blue",
  "green",
  "red",
] as const;

export type HeroColor = (typeof HERO_COLORS)[number];

export type HeroPreferences = {
  color: HeroColor;
  visible: boolean;
};

export const DEFAULT_HERO_PREFERENCES: HeroPreferences = {
  color: "default",
  visible: true,
};

/** Curated text colours for non-default hero appearance. */
export const HERO_COLOR_VALUES: Record<
  Exclude<HeroColor, "default">,
  string
> = {
  slate: "#64748b",
  blue: "#1d4ed8",
  green: "#15803d",
  red: "#b91c1c",
};

export function isHeroColor(value: unknown): value is HeroColor {
  return (
    typeof value === "string" &&
    (HERO_COLORS as readonly string[]).includes(value)
  );
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

export function nextHeroColor(color: HeroColor): HeroColor {
  const index = HERO_COLORS.indexOf(color);
  const safeIndex = index < 0 ? 0 : index;
  return HERO_COLORS[(safeIndex + 1) % HERO_COLORS.length]!;
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
  return { color: HERO_COLOR_VALUES[color] };
}
