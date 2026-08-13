/**
 * Stage 8A — presence heartbeat validation, geo, upsert semantics.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveCoarseGeoFromHeaders,
  normalizeCity,
  normalizeCountryCode,
  PRESENCE_CITY_MAX_LENGTH,
} from "@/lib/presence/geo";
import { processPresenceHeartbeat } from "@/lib/presence/process-heartbeat";
import { isUuid, normalizeSessionId } from "@/lib/presence/session-id";
import type { PresenceSupabase } from "@/lib/presence/supabase-server";
import { upsertPresenceHeartbeat } from "@/lib/presence/upsert";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

type UpsertCapture = {
  payloads: Record<string, unknown>[];
  fail?: boolean;
};

function mockSupabase(capture: UpsertCapture): PresenceSupabase {
  return {
    from(table: string) {
      assert.equal(table, "presence");
      return {
        upsert(payload: Record<string, unknown>, opts: { onConflict: string }) {
          assert.equal(opts.onConflict, "session_id");
          capture.payloads.push(payload);
          if (capture.fail) {
            return Promise.resolve({
              error: { message: "db boom" },
            });
          }
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as PresenceSupabase;
}

describe("Stage 8A session ID", () => {
  it("accepts crypto.randomUUID-shaped values", () => {
    assert.equal(isUuid(VALID_UUID), true);
    assert.equal(isUuid(VALID_UUID.toUpperCase()), true);
    assert.equal(normalizeSessionId(VALID_UUID.toUpperCase()), VALID_UUID);
  });

  it("rejects malformed IDs", () => {
    assert.equal(isUuid(""), false);
    assert.equal(isUuid("not-a-uuid"), false);
    assert.equal(isUuid("550e8400e29b41d4a716446655440000"), false);
    assert.equal(isUuid(null), false);
    assert.equal(isUuid(123), false);
  });
});

describe("Stage 8A geo normalization", () => {
  it("4. missing geo → null", () => {
    const geo = deriveCoarseGeoFromHeaders(new Headers());
    assert.deepEqual(geo, { countryCode: null, city: null });
  });

  it("5. valid Vercel country/city → coarsened public label", () => {
    const headers = new Headers({
      "x-vercel-ip-country": " gb ",
      "x-vercel-ip-city": "London",
      "x-vercel-ip-country-region": "ENG",
    });
    assert.deepEqual(deriveCoarseGeoFromHeaders(headers), {
      countryCode: "GB",
      city: "London",
    });
  });

  it("6. malformed country → null", () => {
    assert.equal(normalizeCountryCode("USA"), null);
    assert.equal(normalizeCountryCode("g"), null);
    assert.equal(normalizeCountryCode("12"), null);
    assert.equal(normalizeCountryCode(""), null);
  });

  it("7. malformed/undecodable city does not crash → null", () => {
    assert.equal(normalizeCity("%E0%A4%A"), null);
    assert.equal(normalizeCity("   "), null);
    assert.equal(normalizeCity("New%20York"), "New York");
    assert.equal(
      normalizeCity("A".repeat(PRESENCE_CITY_MAX_LENGTH + 20))?.length,
      PRESENCE_CITY_MAX_LENGTH,
    );
  });

  it("11. geo helpers never take IP/lat/lon inputs", () => {
    const headers = new Headers({
      "x-vercel-ip-country": "US",
      "x-vercel-ip-city": "Austin",
      "x-vercel-ip-country-region": "TX",
      "x-forwarded-for": "1.2.3.4",
      "x-vercel-ip-latitude": "30.0",
      "x-vercel-ip-longitude": "-97.0",
      "x-real-ip": "9.9.9.9",
    });
    const geo = deriveCoarseGeoFromHeaders(headers);
    assert.deepEqual(geo, { countryCode: "US", city: "Austin" });
    assert.equal("ip" in geo, false);
    assert.equal("latitude" in geo, false);
    assert.equal("longitude" in geo, false);
  });
});

describe("Stage 8A processPresenceHeartbeat", () => {
  it("1. missing sessionId → 400", async () => {
    const capture: UpsertCapture = { payloads: [] };
    const result = await processPresenceHeartbeat({
      body: {},
      headers: new Headers(),
      supabase: mockSupabase(capture),
    });
    assert.deepEqual(result, {
      ok: false,
      status: 400,
      error: "missing_session_id",
    });
    assert.equal(capture.payloads.length, 0);
  });

  it("2. malformed UUID → 400", async () => {
    const capture: UpsertCapture = { payloads: [] };
    const result = await processPresenceHeartbeat({
      body: { sessionId: "nope" },
      headers: new Headers(),
      supabase: mockSupabase(capture),
    });
    assert.deepEqual(result, {
      ok: false,
      status: 400,
      error: "invalid_session_id",
    });
    assert.equal(capture.payloads.length, 0);
  });

  it("3. valid UUID → presence write", async () => {
    const capture: UpsertCapture = { payloads: [] };
    const result = await processPresenceHeartbeat({
      body: { sessionId: VALID_UUID },
      headers: new Headers(),
      supabase: mockSupabase(capture),
      nowIso: "2024-06-01T12:00:00.000Z",
    });
    assert.deepEqual(result, { ok: true });
    assert.equal(capture.payloads.length, 1);
    assert.equal(capture.payloads[0]!.session_id, VALID_UUID);
    assert.equal(capture.payloads[0]!.last_seen_at, "2024-06-01T12:00:00.000Z");
  });

  it("4+5 via process: geo from headers persisted; missing → null", async () => {
    const capture: UpsertCapture = { payloads: [] };
    await processPresenceHeartbeat({
      body: { sessionId: VALID_UUID },
      headers: new Headers({
        "x-vercel-ip-country": "jp",
        "x-vercel-ip-city": "Tokyo",
      }),
      supabase: mockSupabase(capture),
      nowIso: "2024-06-01T12:00:00.000Z",
    });
    assert.equal(capture.payloads[0]!.country_code, "JP");
    assert.equal(capture.payloads[0]!.city, "Tokyo");

    const capture2: UpsertCapture = { payloads: [] };
    await processPresenceHeartbeat({
      body: { sessionId: VALID_UUID },
      headers: new Headers(),
      supabase: mockSupabase(capture2),
      nowIso: "2024-06-01T12:00:00.000Z",
    });
    assert.equal(capture2.payloads[0]!.country_code, null);
    assert.equal(capture2.payloads[0]!.city, null);
  });

  it("8–9. upsert omits first_seen_at (preserve on update; DB default on insert)", async () => {
    const capture: UpsertCapture = { payloads: [] };
    await upsertPresenceHeartbeat(mockSupabase(capture), {
      sessionId: VALID_UUID,
      geo: { countryCode: "US", city: "Austin" },
      seenAtIso: "2024-06-01T13:00:00.000Z",
    });
    const payload = capture.payloads[0]!;
    assert.equal("first_seen_at" in payload, false);
    assert.equal(payload.last_seen_at, "2024-06-01T13:00:00.000Z");
    assert.equal(payload.country_code, "US");
    assert.equal(payload.city, "Austin");
  });

  it("10. client-supplied geo fields are ignored", async () => {
    const capture: UpsertCapture = { payloads: [] };
    await processPresenceHeartbeat({
      body: {
        sessionId: VALID_UUID,
        country: "FR",
        city: "Paris",
        countryCode: "FR",
        ip: "1.2.3.4",
        latitude: 48.8,
        longitude: 2.3,
      },
      headers: new Headers({
        "x-vercel-ip-country": "US",
        "x-vercel-ip-city": "Austin",
      }),
      supabase: mockSupabase(capture),
      nowIso: "2024-06-01T12:00:00.000Z",
    });
    assert.equal(capture.payloads[0]!.country_code, "US");
    assert.equal(capture.payloads[0]!.city, "Austin");
    assert.equal("ip" in capture.payloads[0]!, false);
    assert.equal("latitude" in capture.payloads[0]!, false);
    assert.equal("longitude" in capture.payloads[0]!, false);
  });

  it("11. written payload has only session/geo/last_seen columns", async () => {
    const capture: UpsertCapture = { payloads: [] };
    await processPresenceHeartbeat({
      body: { sessionId: VALID_UUID },
      headers: new Headers({
        "x-forwarded-for": "8.8.8.8",
        "x-vercel-ip-latitude": "1",
        "x-vercel-ip-longitude": "2",
      }),
      supabase: mockSupabase(capture),
      nowIso: "2024-06-01T12:00:00.000Z",
    });
    const keys = Object.keys(capture.payloads[0]!).sort();
    assert.deepEqual(keys, [
      "city",
      "country_code",
      "last_seen_at",
      "session_id",
    ]);
  });

  it("DB failure → 500 without leaking internals", async () => {
    const capture: UpsertCapture = { payloads: [], fail: true };
    const result = await processPresenceHeartbeat({
      body: { sessionId: VALID_UUID },
      headers: new Headers(),
      supabase: mockSupabase(capture),
    });
    assert.deepEqual(result, {
      ok: false,
      status: 500,
      error: "upsert_failed",
    });
  });
});
