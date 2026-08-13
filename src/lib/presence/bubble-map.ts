/**
 * Pure helpers for the presence country bubble map (UI-only).
 */

import { countryCodeToMapPoint } from "@/lib/presence/country-centroids";

export type PresenceBubble = {
  code: string;
  count: number;
  x: number;
  y: number;
  radius: number;
};

export const BUBBLE_RADIUS_MIN = 2.2 as const;
export const BUBBLE_RADIUS_MAX = 7.5 as const;

/**
 * Restrained sqrt scaling relative to the densest plotted country.
 * Caps so one country never overwhelms the silhouette.
 */
export function bubbleRadiusForCount(
  count: number,
  maxCount: number,
): number {
  const n = Math.max(0, Math.floor(count));
  if (n < 1) return 0;
  const peak = Math.max(1, Math.floor(maxCount));
  const t = Math.sqrt(n / peak);
  return (
    BUBBLE_RADIUS_MIN +
    (BUBBLE_RADIUS_MAX - BUBBLE_RADIUS_MIN) * Math.min(1, t)
  );
}

export function buildPresenceBubbles(
  byCountry: Record<string, number> | null | undefined,
): PresenceBubble[] {
  if (!byCountry) return [];

  const candidates: { code: string; count: number; x: number; y: number }[] =
    [];
  for (const [rawCode, rawCount] of Object.entries(byCountry)) {
    const code = rawCode.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) continue;
    if (typeof rawCount !== "number" || !Number.isFinite(rawCount)) continue;
    const count = Math.floor(rawCount);
    if (count < 1) continue;
    const point = countryCodeToMapPoint(code);
    if (!point) continue;
    candidates.push({ code, count, x: point.x, y: point.y });
  }

  const maxCount = candidates.reduce(
    (max, row) => Math.max(max, row.count),
    0,
  );

  return candidates
    .map((row) => ({
      ...row,
      radius: bubbleRadiusForCount(row.count, maxCount),
    }))
    .sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      return a.code.localeCompare(b.code);
    });
}

export function formatPeopleHereLabel(liveUsers: number | null): string {
  if (liveUsers === null) return "PEOPLE HERE · …";
  const n = Math.max(0, Math.floor(liveUsers));
  return `PEOPLE HERE · ${n}`;
}

export function formatCountryCountLabel(countryCount: number): string {
  const n = Math.max(0, Math.floor(countryCount));
  if (n === 1) return "1 COUNTRY";
  return `${n} COUNTRIES`;
}

/** Distinct ISO-2 keys with count ≥ 1 (plotted or not). */
export function countActiveCountries(
  byCountry: Record<string, number> | null | undefined,
): number {
  if (!byCountry) return 0;
  let n = 0;
  for (const [code, count] of Object.entries(byCountry)) {
    if (!/^[A-Z]{2}$/.test(code.trim().toUpperCase())) continue;
    if (typeof count === "number" && Number.isFinite(count) && count >= 1) {
      n += 1;
    }
  }
  return n;
}
