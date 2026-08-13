/**
 * Coarse geo from trusted Vercel request headers only.
 * Never persist IP / lat / lon / postal / neighbourhoods / small towns.
 *
 * Public location rule (Stage 8A.5):
 *   major-city allowlist → city label
 *   else country-region (ISO 3166-2) → region/state label
 *   else country code
 *
 * The persisted `presence.city` column stores this public label only
 * (schema reuse; not raw locality when coarsened away).
 */

/** Cap public location string length stored in presence.city */
export const PRESENCE_CITY_MAX_LENGTH = 80 as const;

const COUNTRY_RE = /^[A-Z]{2}$/;
const REGION_RE = /^[A-Z0-9]{1,3}$/;

export type CoarseGeo = {
  countryCode: string | null;
  /**
   * Public location label written to presence.city.
   * Already coarsened — never a rejected small-town locality.
   */
  city: string | null;
};

export type RawGeoFields = {
  countryCode: string | null;
  city: string | null;
  region: string | null;
};

/**
 * Conservative major-city allowlist (case-insensitive match after normalizeCity).
 * Not a geocoder — privacy-first; unrecognized cities fall back to region/country.
 */
export const MAJOR_PUBLIC_CITIES: readonly string[] = [
  "Amsterdam",
  "Athens",
  "Atlanta",
  "Auckland",
  "Austin",
  "Bangkok",
  "Barcelona",
  "Beijing",
  "Berlin",
  "Birmingham",
  "Boston",
  "Brisbane",
  "Bristol",
  "Brussels",
  "Budapest",
  "Buenos Aires",
  "Cairo",
  "Cape Town",
  "Chicago",
  "Copenhagen",
  "Dallas",
  "Delhi",
  "Denver",
  "Dubai",
  "Dublin",
  "Edinburgh",
  "Frankfurt",
  "Glasgow",
  "Hong Kong",
  "Houston",
  "Istanbul",
  "Jakarta",
  "Johannesburg",
  "Lagos",
  "Leeds",
  "Lisbon",
  "Liverpool",
  "London",
  "Los Angeles",
  "Madrid",
  "Manchester",
  "Melbourne",
  "Mexico City",
  "Miami",
  "Milan",
  "Montreal",
  "Mumbai",
  "Munich",
  "Nairobi",
  "New York",
  "Oslo",
  "Paris",
  "Perth",
  "Philadelphia",
  "Phoenix",
  "Prague",
  "Rome",
  "San Francisco",
  "Santiago",
  "Sao Paulo",
  "São Paulo",
  "Seattle",
  "Seoul",
  "Shanghai",
  "Singapore",
  "Stockholm",
  "Sydney",
  "Taipei",
  "Tokyo",
  "Toronto",
  "Vancouver",
  "Vienna",
  "Warsaw",
  "Washington",
  "Zurich",
] as const;

const MAJOR_CITY_KEYS = new Set(
  MAJOR_PUBLIC_CITIES.map((c) => c.toLowerCase()),
);

/** Friendly labels keyed by `${countryCode}:${regionCode}`. */
const REGION_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  // United States
  "US:AL": "Alabama",
  "US:AK": "Alaska",
  "US:AZ": "Arizona",
  "US:AR": "Arkansas",
  "US:CA": "California",
  "US:CO": "Colorado",
  "US:CT": "Connecticut",
  "US:DE": "Delaware",
  "US:FL": "Florida",
  "US:GA": "Georgia",
  "US:HI": "Hawaii",
  "US:ID": "Idaho",
  "US:IL": "Illinois",
  "US:IN": "Indiana",
  "US:IA": "Iowa",
  "US:KS": "Kansas",
  "US:KY": "Kentucky",
  "US:LA": "Louisiana",
  "US:ME": "Maine",
  "US:MD": "Maryland",
  "US:MA": "Massachusetts",
  "US:MI": "Michigan",
  "US:MN": "Minnesota",
  "US:MS": "Mississippi",
  "US:MO": "Missouri",
  "US:MT": "Montana",
  "US:NE": "Nebraska",
  "US:NV": "Nevada",
  "US:NH": "New Hampshire",
  "US:NJ": "New Jersey",
  "US:NM": "New Mexico",
  "US:NY": "New York",
  "US:NC": "North Carolina",
  "US:ND": "North Dakota",
  "US:OH": "Ohio",
  "US:OK": "Oklahoma",
  "US:OR": "Oregon",
  "US:PA": "Pennsylvania",
  "US:RI": "Rhode Island",
  "US:SC": "South Carolina",
  "US:SD": "South Dakota",
  "US:TN": "Tennessee",
  "US:TX": "Texas",
  "US:UT": "Utah",
  "US:VT": "Vermont",
  "US:VA": "Virginia",
  "US:WA": "Washington",
  "US:WV": "West Virginia",
  "US:WI": "Wisconsin",
  "US:WY": "Wyoming",
  "US:DC": "Washington DC",
  // United Kingdom (Vercel first-level region — not county)
  "GB:ENG": "England",
  "GB:SCT": "Scotland",
  "GB:WLS": "Wales",
  "GB:NIR": "Northern Ireland",
  // Canada
  "CA:AB": "Alberta",
  "CA:BC": "British Columbia",
  "CA:MB": "Manitoba",
  "CA:NB": "New Brunswick",
  "CA:NL": "Newfoundland and Labrador",
  "CA:NS": "Nova Scotia",
  "CA:NT": "Northwest Territories",
  "CA:NU": "Nunavut",
  "CA:ON": "Ontario",
  "CA:PE": "Prince Edward Island",
  "CA:QC": "Quebec",
  "CA:SK": "Saskatchewan",
  "CA:YT": "Yukon",
  // Australia
  "AU:NSW": "New South Wales",
  "AU:VIC": "Victoria",
  "AU:QLD": "Queensland",
  "AU:SA": "South Australia",
  "AU:WA": "Western Australia",
  "AU:TAS": "Tasmania",
  "AU:ACT": "Australian Capital Territory",
  "AU:NT": "Northern Territory",
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
 * Normalize ISO 3166-2 region portion from x-vercel-ip-country-region.
 * Up to 3 alphanumerics after trim+uppercase (e.g. TX, ENG, 13).
 */
export function normalizeRegionCode(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const code = raw.trim().toUpperCase();
  if (!REGION_RE.test(code)) return null;
  return code;
}

export function isMajorPublicCity(city: string | null | undefined): boolean {
  if (!city) return false;
  return MAJOR_CITY_KEYS.has(city.trim().toLowerCase());
}

/**
 * Map a region code to a public display label.
 * Numeric-only regions (e.g. JP prefecture ids) are rejected → null
 * so callers can fall back to country rather than opaque digits.
 */
export function formatRegionLabel(
  regionCode: string | null,
  countryCode: string | null = null,
): string | null {
  if (!regionCode) return null;
  if (/^\d+$/.test(regionCode)) return null;
  if (countryCode) {
    const named = REGION_DISPLAY_NAMES[`${countryCode}:${regionCode}`];
    if (named) return named;
  }
  // Unknown subdivision — still safer than a small town name.
  return regionCode;
}

/**
 * Resolve the single public location label to persist / aggregate.
 * Privacy outranks precision — small towns are never returned.
 */
export function resolvePublicLocationLabel(input: {
  city: string | null;
  region: string | null;
  countryCode: string | null;
}): string | null {
  if (input.city && isMajorPublicCity(input.city)) {
    return input.city;
  }

  const regionLabel = formatRegionLabel(input.region, input.countryCode);
  if (regionLabel) return regionLabel;

  if (input.countryCode) return input.countryCode;

  return null;
}

export function readRawGeoFromHeaders(headers: Headers): RawGeoFields {
  return {
    countryCode: normalizeCountryCode(headers.get("x-vercel-ip-country")),
    city: normalizeCity(headers.get("x-vercel-ip-city")),
    region: normalizeRegionCode(headers.get("x-vercel-ip-country-region")),
  };
}

/**
 * Read coarse geo from a Headers-like object (Request headers).
 * Only Vercel country / city / country-region headers are consulted.
 * Result.city is the coarsened public label (schema field reuse).
 */
export function deriveCoarseGeoFromHeaders(headers: Headers): CoarseGeo {
  const raw = readRawGeoFromHeaders(headers);
  return {
    countryCode: raw.countryCode,
    city: resolvePublicLocationLabel(raw),
  };
}
