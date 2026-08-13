/**
 * Visualization-only ISO-2 → approximate country centroids.
 * Equirectangular lon/lat for a 360×180 map viewBox (x = lon+180, y = 90−lat).
 * Not user location data — static display anchors for aggregate country counts.
 */

export type CountryCentroid = {
  /** Longitude degrees (−180…180). */
  lon: number;
  /** Latitude degrees (−90…90). */
  lat: number;
};

/** Compact maintainable set of common ISO-2 centroids (rough geographic centres). */
export const COUNTRY_CENTROIDS: Readonly<Record<string, CountryCentroid>> = {
  AE: { lon: 54, lat: 24 },
  AR: { lon: -64, lat: -34 },
  AT: { lon: 14, lat: 47 },
  AU: { lon: 134, lat: -25 },
  BE: { lon: 4, lat: 51 },
  BG: { lon: 25, lat: 43 },
  BR: { lon: -53, lat: -14 },
  CA: { lon: -96, lat: 60 },
  CH: { lon: 8, lat: 47 },
  CL: { lon: -71, lat: -35 },
  CN: { lon: 105, lat: 35 },
  CO: { lon: -74, lat: 4 },
  CZ: { lon: 15, lat: 50 },
  DE: { lon: 10, lat: 51 },
  DK: { lon: 10, lat: 56 },
  EG: { lon: 30, lat: 27 },
  ES: { lon: -4, lat: 40 },
  FI: { lon: 26, lat: 64 },
  FR: { lon: 2, lat: 46 },
  GB: { lon: -2, lat: 54 },
  GR: { lon: 22, lat: 39 },
  HK: { lon: 114, lat: 22 },
  HU: { lon: 19, lat: 47 },
  ID: { lon: 118, lat: -2 },
  IE: { lon: -8, lat: 53 },
  IL: { lon: 35, lat: 31 },
  IN: { lon: 78, lat: 22 },
  IT: { lon: 12, lat: 42 },
  JP: { lon: 138, lat: 36 },
  KE: { lon: 38, lat: 1 },
  KR: { lon: 128, lat: 36 },
  MX: { lon: -102, lat: 23 },
  MY: { lon: 102, lat: 4 },
  NG: { lon: 8, lat: 10 },
  NL: { lon: 5, lat: 52 },
  NO: { lon: 10, lat: 62 },
  NZ: { lon: 174, lat: -41 },
  PE: { lon: -76, lat: -10 },
  PH: { lon: 122, lat: 12 },
  PL: { lon: 19, lat: 52 },
  PT: { lon: -8, lat: 39 },
  RO: { lon: 25, lat: 46 },
  RU: { lon: 100, lat: 60 },
  SA: { lon: 45, lat: 24 },
  SE: { lon: 15, lat: 62 },
  SG: { lon: 104, lat: 1 },
  TH: { lon: 101, lat: 15 },
  TR: { lon: 35, lat: 39 },
  TW: { lon: 121, lat: 24 },
  UA: { lon: 32, lat: 49 },
  US: { lon: -98, lat: 39 },
  VN: { lon: 108, lat: 16 },
  ZA: { lon: 25, lat: -29 },
} as const;

export const BUBBLE_MAP_VIEW_WIDTH = 360 as const;
export const BUBBLE_MAP_VIEW_HEIGHT = 180 as const;

export function countryCodeToMapPoint(
  code: string,
): { x: number; y: number } | null {
  const key = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(key)) return null;
  const centroid = COUNTRY_CENTROIDS[key];
  if (!centroid) return null;
  return {
    x: centroid.lon + 180,
    y: 90 - centroid.lat,
  };
}
