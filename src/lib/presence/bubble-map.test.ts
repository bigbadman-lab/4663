/**
 * Presence country bubble map helpers + chrome wiring.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildPresenceBubbles,
  bubbleRadiusForCount,
  countActiveCountries,
  formatCountryCountLabel,
  formatPeopleHereLabel,
  BUBBLE_RADIUS_MAX,
  BUBBLE_RADIUS_MIN,
} from "@/lib/presence/bubble-map";
import { countryCodeToMapPoint } from "@/lib/presence/country-centroids";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("presence bubble map helpers", () => {
  it("1. PEOPLE HERE + COUNTRY pluralization", () => {
    assert.equal(formatPeopleHereLabel(null), "PEOPLE HERE · …");
    assert.equal(formatPeopleHereLabel(0), "PEOPLE HERE · 0");
    assert.equal(formatPeopleHereLabel(12), "PEOPLE HERE · 12");
    assert.equal(formatCountryCountLabel(0), "0 COUNTRIES");
    assert.equal(formatCountryCountLabel(1), "1 COUNTRY");
    assert.equal(formatCountryCountLabel(6), "6 COUNTRIES");
  });

  it("2. bubbles from byCountry only; unknown codes omitted", () => {
    const bubbles = buildPresenceBubbles({
      GB: 4,
      US: 2,
      ZZ: 9,
      XX: 1,
      de: 3,
    });
    assert.deepEqual(
      bubbles.map((b) => b.code),
      ["GB", "DE", "US"],
    );
    assert.ok(bubbles.every((b) => b.radius >= BUBBLE_RADIUS_MIN));
    assert.ok(bubbles.every((b) => b.radius <= BUBBLE_RADIUS_MAX));
    assert.equal(countryCodeToMapPoint("ZZ"), null);
    assert.ok(countryCodeToMapPoint("GB"));
  });

  it("3. bubble radius is restrained sqrt scaling", () => {
    const small = bubbleRadiusForCount(1, 16);
    const large = bubbleRadiusForCount(16, 16);
    assert.ok(small < large);
    assert.equal(bubbleRadiusForCount(0, 16), 0);
    assert.equal(bubbleRadiusForCount(16, 16), BUBBLE_RADIUS_MAX);
  });

  it("4. zero-user / empty byCountry", () => {
    assert.deepEqual(buildPresenceBubbles({}), []);
    assert.deepEqual(buildPresenceBubbles(null), []);
    assert.equal(countActiveCountries({}), 0);
    assert.equal(countActiveCountries({ GB: 0, US: 2 }), 1);
  });
});

describe("presence bubble map presentation", () => {
  it("5. chrome mounts PresenceStatus; map shows PEOPLE HERE", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("PresenceStatus"));
    assert.ok(chrome.includes("data-4663-chrome-presence"));
    assert.ok(chrome.includes("bottom-5 left-5") || chrome.includes("sm:bottom-6 sm:left-6"));

    const map = readSrc("src/components/presence-bubble-map.tsx");
    assert.ok(map.includes("formatPeopleHereLabel"));
    assert.ok(map.includes("formatCountryCountLabel"));
    assert.ok(map.includes("buildPresenceBubbles"));
    assert.ok(map.includes("byCountry"));
    assert.ok(map.includes("startPresenceSummaryPolling"));
    assert.equal(map.includes("byCity"), false);
    assert.equal(map.includes("sessionId"), false);
    assert.equal(map.includes("session_id"), false);
    assert.equal(map.includes("latitude"), false);
    assert.equal(map.includes("longitude"), false);
  });

  it("6. PresenceStatus re-exports bubble map; format-presence retained", () => {
    const status = readSrc("src/components/presence-status.tsx");
    assert.ok(status.includes("presence-bubble-map"));
    assert.ok(status.includes("PresenceBubbleMap"));

    const format = readSrc("src/lib/presence/format-presence.ts");
    assert.ok(format.includes("formatPresenceLine"));
    assert.ok(format.includes("PRESENCE_SUMMARY_POLL_MS"));
  });
});
