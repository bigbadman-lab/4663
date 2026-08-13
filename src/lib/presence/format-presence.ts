/**
 * Pure formatting for Stage 8D / 8A.5 visible presence line.
 * Single-line, bounded location groups; online count is highest priority.
 */

import type { PresenceSummaryResponse } from "@/lib/presence/summary";

export const PRESENCE_SUMMARY_POLL_MS = 15_000 as const;

/** Desktop / default: how many location groups before +N MORE. */
export const PRESENCE_PLACE_LIMIT_DESKTOP = 4 as const;
/** Narrow / mobile: fewer groups so the line stays readable. */
export const PRESENCE_PLACE_LIMIT_NARROW = 2 as const;

/** @deprecated Prefer PRESENCE_PLACE_LIMIT_DESKTOP */
export const PRESENCE_PLACE_LIMIT = PRESENCE_PLACE_LIMIT_DESKTOP;

export type PresenceLocationGroup = {
  label: string;
  count: number;
};

export type FormatPresenceLineOptions = {
  /** Max location groups to render before overflow collapse. */
  maxPlaces?: number;
};

/**
 * Online count fragment. Loading → ….
 * Example: "100 ONLINE"
 */
export function formatPresenceCount(liveUsers: number | null): string {
  if (liveUsers === null) return "…";
  const n = Math.max(0, Math.floor(liveUsers));
  return `${n} ONLINE`;
}

/**
 * Build sorted public location groups from summary aggregates.
 * Prefers byCity (already coarsened public labels); falls back to byCountry.
 */
export function buildPresenceLocationGroups(
  summary: Pick<PresenceSummaryResponse, "byCity" | "byCountry"> | null,
): PresenceLocationGroup[] {
  if (!summary) return [];

  const fromCities: PresenceLocationGroup[] = [];
  for (const entry of summary.byCity) {
    const label = entry.city.trim();
    if (!label) continue;
    if (
      typeof entry.count !== "number" ||
      !Number.isFinite(entry.count) ||
      entry.count < 1
    ) {
      continue;
    }
    fromCities.push({ label, count: Math.floor(entry.count) });
  }

  if (fromCities.length > 0) {
    return fromCities.sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      return a.label.localeCompare(b.label);
    });
  }

  return Object.entries(summary.byCountry)
    .filter(
      ([code, count]) =>
        /^[A-Z]{2}$/.test(code) &&
        typeof count === "number" &&
        Number.isFinite(count) &&
        count >= 1,
    )
    .map(([code, count]) => ({
      label: code,
      count: Math.floor(count),
    }))
    .sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      return a.label.localeCompare(b.label);
    });
}

/**
 * Format location fragment for the footer.
 * Examples:
 *   "LONDON 28 · NEW YORK 16 · +18 MORE"
 *   "24 LOCATIONS" (when maxPlaces === 0 but locations exist)
 *   "" (no geo)
 */
export function formatPresencePlaces(
  summary: Pick<PresenceSummaryResponse, "byCity" | "byCountry"> | null,
  options: FormatPresenceLineOptions = {},
): string {
  const maxPlaces = Math.max(
    0,
    Math.floor(options.maxPlaces ?? PRESENCE_PLACE_LIMIT_DESKTOP),
  );
  const groups = buildPresenceLocationGroups(summary);
  if (groups.length === 0) return "";

  if (maxPlaces === 0) {
    return `${groups.length} LOCATION${groups.length === 1 ? "" : "S"}`;
  }

  const shown = groups.slice(0, maxPlaces);
  const remaining = groups.length - shown.length;
  const parts = shown.map(
    (g) => `${g.label.toUpperCase()} ${g.count}`,
  );
  if (remaining > 0) {
    parts.push(`+${remaining} MORE`);
  }
  return parts.join(" · ");
}

/**
 * Full single-line presence status.
 * Online count always leads; locations / overflow follow when present.
 */
export function formatPresenceLine(
  summary: PresenceSummaryResponse | null,
  options: FormatPresenceLineOptions = {},
): string {
  const count = formatPresenceCount(summary ? summary.liveUsers : null);
  if (!summary) return count;
  const places = formatPresencePlaces(summary, options);
  if (!places) return count;
  return `${count} · ${places}`;
}

export function parsePresenceSummaryJson(
  value: unknown,
): PresenceSummaryResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.liveUsers !== "number" || !Number.isFinite(row.liveUsers)) {
    return null;
  }
  if (
    !row.byCountry ||
    typeof row.byCountry !== "object" ||
    Array.isArray(row.byCountry)
  ) {
    return null;
  }
  if (!Array.isArray(row.byCity)) return null;

  const byCountry: Record<string, number> = {};
  for (const [k, v] of Object.entries(
    row.byCountry as Record<string, unknown>,
  )) {
    if (typeof v === "number" && Number.isFinite(v) && v >= 1) {
      byCountry[k] = Math.floor(v);
    }
  }

  const byCity: PresenceSummaryResponse["byCity"] = [];
  for (const entry of row.byCity) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.city !== "string" || typeof e.countryCode !== "string") {
      continue;
    }
    if (typeof e.count !== "number" || !Number.isFinite(e.count) || e.count < 1) {
      continue;
    }
    byCity.push({
      city: e.city,
      countryCode: e.countryCode,
      count: Math.floor(e.count),
    });
  }

  const totalLocations =
    typeof row.totalLocations === "number" && Number.isFinite(row.totalLocations)
      ? Math.max(0, Math.floor(row.totalLocations))
      : byCity.length > 0
        ? byCity.length
        : Object.keys(byCountry).length;

  return {
    liveUsers: Math.max(0, Math.floor(row.liveUsers)),
    byCountry,
    byCity,
    totalLocations,
  };
}
