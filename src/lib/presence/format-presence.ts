/**
 * Pure formatting for Stage 8D visible presence lines.
 */

import type { PresenceSummaryResponse } from "@/lib/presence/summary";

export const PRESENCE_SUMMARY_POLL_MS = 15_000 as const;
export const PRESENCE_PLACE_LIMIT = 3 as const;

export function formatPresenceCount(liveUsers: number | null): string {
  if (liveUsers === null) return "…";
  const n = Math.max(0, Math.floor(liveUsers));
  if (n === 1) return "1 person here";
  return `${n} people here`;
}

/**
 * Optional second line. Empty string means omit.
 * Prefers cities (max 3), else ISO-2 countries (max 3).
 */
export function formatPresencePlaces(
  summary: Pick<PresenceSummaryResponse, "byCity" | "byCountry"> | null,
): string {
  if (!summary) return "";

  const cities = summary.byCity
    .map((c) => c.city.trim())
    .filter((c) => c.length > 0)
    .slice(0, PRESENCE_PLACE_LIMIT);

  if (cities.length > 0) {
    return `from ${cities.join(" · ")}`;
  }

  const countries = Object.entries(summary.byCountry)
    .filter(
      ([code, count]) =>
        /^[A-Z]{2}$/.test(code) &&
        typeof count === "number" &&
        Number.isFinite(count) &&
        count >= 1,
    )
    // API object order is insertion order from jsonb_object_agg — not guaranteed.
    // Sort by count desc, then code, matching summary city ordering spirit.
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .map(([code]) => code)
    .slice(0, PRESENCE_PLACE_LIMIT);

  if (countries.length > 0) {
    return `from ${countries.join(" · ")}`;
  }

  return "";
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

  return {
    liveUsers: Math.max(0, Math.floor(row.liveUsers)),
    byCountry,
    byCity,
  };
}
