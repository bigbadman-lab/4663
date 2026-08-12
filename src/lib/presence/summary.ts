/**
 * Public presence summary: load + normalize + privacy filter.
 * Never expose raw presence / session / geo-precise fields.
 */

import { normalizeCountryCode } from "@/lib/presence/geo";
import type { PresenceSupabase } from "@/lib/presence/supabase-server";

export type PresenceCityAggregate = {
  city: string;
  countryCode: string;
  count: number;
};

export type PresenceSummaryResponse = {
  liveUsers: number;
  byCountry: Record<string, number>;
  byCity: PresenceCityAggregate[];
};

export const EMPTY_PRESENCE_SUMMARY: PresenceSummaryResponse = {
  liveUsers: 0,
  byCountry: {},
  byCity: [],
};

const ISO2_RE = /^[A-Z]{2}$/;

function asNonNegInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return null;
}

function asPositiveInt(value: unknown): number | null {
  const n = asNonNegInt(value);
  if (n === null || n < 1) return null;
  return n;
}

/**
 * Normalize a DB view row (or null) into the public API contract.
 * Strips city entries with count < 2. Keeps country count = 1.
 */
export function normalizePresenceSummary(
  row: unknown,
): PresenceSummaryResponse {
  if (row === null || row === undefined) {
    return { ...EMPTY_PRESENCE_SUMMARY, byCountry: {}, byCity: [] };
  }
  if (typeof row !== "object" || Array.isArray(row)) {
    return { ...EMPTY_PRESENCE_SUMMARY, byCountry: {}, byCity: [] };
  }

  const record = row as Record<string, unknown>;

  const liveUsers = asNonNegInt(record.live_users) ?? 0;

  const byCountry: Record<string, number> = {};
  const rawCountry = record.by_country;
  if (rawCountry && typeof rawCountry === "object" && !Array.isArray(rawCountry)) {
    for (const [key, value] of Object.entries(
      rawCountry as Record<string, unknown>,
    )) {
      const code = normalizeCountryCode(key);
      const count = asPositiveInt(value);
      if (code && ISO2_RE.test(code) && count !== null) {
        byCountry[code] = count;
      }
    }
  }

  const byCity: PresenceCityAggregate[] = [];
  const rawCity = record.by_city;
  if (Array.isArray(rawCity)) {
    for (const entry of rawCity) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const e = entry as Record<string, unknown>;
      const cityRaw = e.city;
      if (typeof cityRaw !== "string") continue;
      const city = cityRaw.trim().replace(/\s+/g, " ");
      if (city.length === 0) continue;

      const countryCode = normalizeCountryCode(
        typeof e.country_code === "string"
          ? e.country_code
          : typeof e.countryCode === "string"
            ? e.countryCode
            : null,
      );
      if (!countryCode) continue;

      const count = asPositiveInt(e.count);
      if (count === null) continue;
      // Privacy: suppress singleton cities
      if (count < 2) continue;

      byCity.push({ city, countryCode, count });
    }
  }

  byCity.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    const c = a.countryCode.localeCompare(b.countryCode);
    if (c !== 0) return c;
    return a.city.localeCompare(b.city);
  });

  return { liveUsers, byCountry, byCity };
}

export type LoadPresenceSummaryResult =
  | { ok: true; summary: PresenceSummaryResponse }
  | { ok: false; error: "summary_unavailable" };

export async function loadPresenceSummary(
  supabase: PresenceSupabase,
): Promise<LoadPresenceSummaryResult> {
  const { data, error } = await supabase
    .from("public_presence_summary")
    .select("live_users, by_country, by_city")
    .maybeSingle();

  if (error) {
    return { ok: false, error: "summary_unavailable" };
  }

  return {
    ok: true,
    summary: normalizePresenceSummary(data),
  };
}
