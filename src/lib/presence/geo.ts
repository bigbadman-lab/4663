/**
 * Coarse geo from trusted Vercel request headers only.
 * Never persist IP / lat / lon / postal.
 */

/** Cap city string length stored in presence.city */
export const PRESENCE_CITY_MAX_LENGTH = 80 as const;

const COUNTRY_RE = /^[A-Z]{2}$/;

export type CoarseGeo = {
  countryCode: string | null;
  city: string | null;
};

/**
 * Normalize country from x-vercel-ip-country (or equivalent).
 * Exactly two ASCII letters after trim+uppercase, else null.
 */
export function normalizeCountryCode(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const code = raw.trim().toUpperCase();
  if (!COUNTRY_RE.test(code)) return null;
  return code;
}

/**
 * Normalize city from x-vercel-ip-city.
 * URL-decode safely; trim; collapse whitespace; cap length; empty → null.
 * Decoding failure must not throw.
 */
export function normalizeCity(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    // Malformed percent-encoding — treat as unusable
    return null;
  }

  const collapsed = decoded.trim().replace(/\s+/g, " ");
  if (collapsed.length === 0) return null;

  if (collapsed.length > PRESENCE_CITY_MAX_LENGTH) {
    return collapsed.slice(0, PRESENCE_CITY_MAX_LENGTH).trimEnd() || null;
  }

  return collapsed;
}

/**
 * Read coarse geo from a Headers-like object (Request headers).
 * Only Vercel country/city headers are consulted.
 */
export function deriveCoarseGeoFromHeaders(headers: Headers): CoarseGeo {
  const countryRaw = headers.get("x-vercel-ip-country");
  const cityRaw = headers.get("x-vercel-ip-city");
  return {
    countryCode: normalizeCountryCode(countryRaw),
    city: normalizeCity(cityRaw),
  };
}
