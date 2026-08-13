/**
 * Stage 8A.5 — privacy-safe public location coarsening.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveCoarseGeoFromHeaders,
  formatRegionLabel,
  isMajorPublicCity,
  normalizeCity,
  normalizeCountryCode,
  normalizeRegionCode,
  readRawGeoFromHeaders,
  resolvePublicLocationLabel,
} from "@/lib/presence/geo";
import { processPresenceHeartbeat } from "@/lib/presence/process-heartbeat";
import type { PresenceSupabase } from "@/lib/presence/supabase-server";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

type UpsertCapture = {
  payloads: Record<string, unknown>[];
};

function mockSupabase(capture: UpsertCapture): PresenceSupabase {
  return {
    from(table: string) {
      assert.equal(table, "presence");
      return {
        upsert(payload: Record<string, unknown>) {
          capture.payloads.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as PresenceSupabase;
}

describe("Stage 8A.5 public location coarsening", () => {
  it("1. small/local town → region/state (not town name)", () => {
    assert.equal(
      resolvePublicLocationLabel({
        city: "Weymouth",
        region: "ENG",
        countryCode: "GB",
      }),
      "England",
    );
    assert.equal(
      resolvePublicLocationLabel({
        city: "Amarillo",
        region: "TX",
        countryCode: "US",
      }),
      "Texas",
    );
    assert.equal(isMajorPublicCity("Weymouth"), false);
    assert.equal(isMajorPublicCity("Amarillo"), false);
  });

  it("2. approved major city remains city-level", () => {
    assert.equal(
      resolvePublicLocationLabel({
        city: "London",
        region: "ENG",
        countryCode: "GB",
      }),
      "London",
    );
    assert.equal(
      resolvePublicLocationLabel({
        city: "New York",
        region: "NY",
        countryCode: "US",
      }),
      "New York",
    );
    assert.equal(isMajorPublicCity("Berlin"), true);
  });

  it("3. country fallback when no safe region", () => {
    assert.equal(
      resolvePublicLocationLabel({
        city: "Somewhere",
        region: null,
        countryCode: "FR",
      }),
      "FR",
    );
    assert.equal(
      resolvePublicLocationLabel({
        city: "Kyoto",
        region: "26",
        countryCode: "JP",
      }),
      "JP",
    );
    assert.equal(formatRegionLabel("26", "JP"), null);
  });

  it("4. raw granular locality is not persisted after normalisation", async () => {
    const capture: UpsertCapture = { payloads: [] };
    await processPresenceHeartbeat({
      body: { sessionId: VALID_UUID },
      headers: new Headers({
        "x-vercel-ip-country": "US",
        "x-vercel-ip-country-region": "TX",
        "x-vercel-ip-city": "Amarillo",
        "x-vercel-ip-latitude": "35.2",
        "x-vercel-ip-longitude": "-101.8",
        "x-vercel-ip-postal-code": "79101",
        "x-forwarded-for": "1.2.3.4",
      }),
      supabase: mockSupabase(capture),
      nowIso: "2026-08-13T12:00:00.000Z",
    });
    assert.equal(capture.payloads[0]!.city, "Texas");
    assert.equal(capture.payloads[0]!.country_code, "US");
    assert.equal("latitude" in capture.payloads[0]!, false);
    assert.equal("longitude" in capture.payloads[0]!, false);
    assert.equal("postal_code" in capture.payloads[0]!, false);
    assert.equal("ip" in capture.payloads[0]!, false);
    assert.equal("region" in capture.payloads[0]!, false);

    const raw = readRawGeoFromHeaders(
      new Headers({
        "x-vercel-ip-country": "GB",
        "x-vercel-ip-country-region": "ENG",
        "x-vercel-ip-city": "Weymouth",
      }),
    );
    assert.equal(raw.city, "Weymouth");
    assert.equal(
      deriveCoarseGeoFromHeaders(
        new Headers({
          "x-vercel-ip-country": "GB",
          "x-vercel-ip-country-region": "ENG",
          "x-vercel-ip-city": "Weymouth",
        }),
      ).city,
      "England",
    );
  });

  it("header normalize helpers remain strict", () => {
    assert.equal(normalizeCountryCode("gb"), "GB");
    assert.equal(normalizeRegionCode(" tx "), "TX");
    assert.equal(normalizeRegionCode("england"), null);
    assert.equal(normalizeCity("New%20York"), "New York");
  });

  it("French locality without major-city match uses region code when unmapped", () => {
    assert.equal(
      resolvePublicLocationLabel({
        city: "Annecy",
        region: "ARA",
        countryCode: "FR",
      }),
      "ARA",
    );
  });
});
