/**
 * Compact presence location-bubble strip helpers + wiring.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildPresenceLocationGroups,
  formatPresenceHereLabel,
  PRESENCE_PLACE_LIMIT_DESKTOP,
  PRESENCE_PLACE_LIMIT_NARROW,
} from "@/lib/presence/format-presence";
import type { PresenceSummaryResponse } from "@/lib/presence/summary";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function base(
  overrides: Partial<PresenceSummaryResponse> = {},
): PresenceSummaryResponse {
  return {
    liveUsers: 0,
    byCountry: {},
    byCity: [],
    totalLocations: 0,
    ...overrides,
  };
}

describe("presence location bubble strip", () => {
  it("1. HERE label + zero / loading", () => {
    assert.equal(formatPresenceHereLabel(null), "…");
    assert.equal(formatPresenceHereLabel(0), "0 HERE");
    assert.equal(formatPresenceHereLabel(18), "18 HERE");
  });

  it("2. sorts byCity labels desc; falls back to country", () => {
    const cities = buildPresenceLocationGroups(
      base({
        byCity: [
          { city: "Berlin", countryCode: "DE", count: 2 },
          { city: "London", countryCode: "GB", count: 6 },
          { city: "New York", countryCode: "US", count: 4 },
        ],
      }),
    );
    assert.deepEqual(
      cities.map((g) => `${g.label.toUpperCase()} ${g.count}`),
      ["LONDON 6", "NEW YORK 4", "BERLIN 2"],
    );

    const countries = buildPresenceLocationGroups(
      base({ byCountry: { US: 3, GB: 5 } }),
    );
    assert.deepEqual(
      countries.map((g) => `${g.label} ${g.count}`),
      ["GB 5", "US 3"],
    );
  });

  it("3. desktop/mobile caps + overflow math", () => {
    assert.equal(PRESENCE_PLACE_LIMIT_DESKTOP, 4);
    assert.equal(PRESENCE_PLACE_LIMIT_NARROW, 2);
    const groups = buildPresenceLocationGroups(
      base({
        byCity: [
          { city: "London", countryCode: "GB", count: 6 },
          { city: "New York", countryCode: "US", count: 4 },
          { city: "Berlin", countryCode: "DE", count: 2 },
          { city: "Paris", countryCode: "FR", count: 2 },
          { city: "Tokyo", countryCode: "JP", count: 1 },
          { city: "Sydney", countryCode: "AU", count: 1 },
        ],
      }),
    );
    assert.equal(groups.length, 6);
    assert.equal(groups.slice(0, PRESENCE_PLACE_LIMIT_DESKTOP).length, 4);
    assert.equal(groups.length - PRESENCE_PLACE_LIMIT_DESKTOP, 2);
    assert.equal(groups.slice(0, PRESENCE_PLACE_LIMIT_NARROW).length, 2);
    assert.equal(groups.length - PRESENCE_PLACE_LIMIT_NARROW, 4);
  });

  it("4. PresenceStatus is compact strip; map code removed", () => {
    const presence = readSrc("src/components/presence-status.tsx");
    assert.ok(presence.includes("formatPresenceHereLabel"));
    assert.ok(presence.includes("data-4663-presence-bubble"));
    assert.ok(presence.includes("data-4663-presence-overflow"));
    assert.ok(presence.includes("+{overflow}"));
    assert.ok(presence.includes("startPresenceSummaryPolling"));
    assert.equal(presence.includes("<svg"), false);
    assert.equal(presence.includes("WORLD_LAND"), false);
    assert.equal(presence.includes("country-centroids"), false);
    assert.equal(presence.includes("session_id"), false);
    assert.equal(presence.includes("latitude"), false);

    assert.throws(() =>
      readSrc("src/components/presence-bubble-map.tsx"),
    );
    assert.throws(() => readSrc("src/lib/presence/country-centroids.ts"));
    assert.throws(() => readSrc("src/lib/presence/bubble-map.ts"));
  });
});
