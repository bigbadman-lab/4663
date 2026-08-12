/**
 * Stage 8C — public presence summary normalization + load.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  loadPresenceSummary,
  normalizePresenceSummary,
} from "@/lib/presence/summary";
import type { PresenceSupabase } from "@/lib/presence/supabase-server";

describe("normalizePresenceSummary", () => {
  it("1. zero-live row → empty API aggregates", () => {
    assert.deepEqual(
      normalizePresenceSummary({
        live_users: 0,
        by_country: {},
        by_city: [],
      }),
      { liveUsers: 0, byCountry: {}, byCity: [] },
    );
  });

  it("2. DB row normalization to camelCase", () => {
    const out = normalizePresenceSummary({
      live_users: 5,
      by_country: { gb: 2, US: 3 },
      by_city: [
        { city: "London", country_code: "gb", count: 2 },
        { city: "Austin", country_code: "US", count: 3 },
      ],
    });
    assert.equal(out.liveUsers, 5);
    assert.deepEqual(out.byCountry, { GB: 2, US: 3 });
    assert.deepEqual(out.byCity, [
      { city: "Austin", countryCode: "US", count: 3 },
      { city: "London", countryCode: "GB", count: 2 },
    ]);
  });

  it("3. city count 1 removed", () => {
    const out = normalizePresenceSummary({
      live_users: 1,
      by_country: { GB: 1 },
      by_city: [{ city: "London", country_code: "GB", count: 1 }],
    });
    assert.deepEqual(out.byCity, []);
  });

  it("4. city count 2+ retained", () => {
    const out = normalizePresenceSummary({
      live_users: 2,
      by_country: { GB: 2 },
      by_city: [{ city: "London", country_code: "GB", count: 2 }],
    });
    assert.deepEqual(out.byCity, [
      { city: "London", countryCode: "GB", count: 2 },
    ]);
  });

  it("5. country count 1 retained", () => {
    const out = normalizePresenceSummary({
      live_users: 1,
      by_country: { IS: 1 },
      by_city: [],
    });
    assert.deepEqual(out.byCountry, { IS: 1 });
  });

  it("6. malformed city rows discarded", () => {
    const out = normalizePresenceSummary({
      live_users: 4,
      by_country: { US: 4 },
      by_city: [
        null,
        "x",
        { city: "", country_code: "US", count: 2 },
        { city: "NYC", country_code: "USA", count: 2 },
        { city: "OK", country_code: "US", count: 0 },
        { city: "Austin", country_code: "US", count: 2 },
      ],
    });
    assert.deepEqual(out.byCity, [
      { city: "Austin", countryCode: "US", count: 2 },
    ]);
  });

  it("7. malformed country/count data safely normalized", () => {
    const out = normalizePresenceSummary({
      live_users: "nope",
      by_country: {
        US: 2,
        XXL: 3,
        "": 1,
        FR: -1,
        DE: 1.9,
      },
      by_city: null,
    });
    assert.equal(out.liveUsers, 0);
    assert.deepEqual(out.byCountry, { US: 2, DE: 1 });
    assert.deepEqual(out.byCity, []);
  });

  it("8. final cities sorted deterministically", () => {
    const out = normalizePresenceSummary({
      live_users: 10,
      by_country: { US: 6, GB: 4 },
      by_city: [
        { city: "Boston", country_code: "US", count: 2 },
        { city: "London", country_code: "GB", count: 3 },
        { city: "Austin", country_code: "US", count: 3 },
        { city: "Bath", country_code: "GB", count: 2 },
      ],
    });
    assert.deepEqual(
      out.byCity.map((c) => `${c.countryCode}:${c.city}:${c.count}`),
      [
        "GB:London:3",
        "US:Austin:3",
        "GB:Bath:2",
        "US:Boston:2",
      ],
    );
  });

  it("9. missing view row → empty summary", () => {
    assert.deepEqual(normalizePresenceSummary(null), {
      liveUsers: 0,
      byCountry: {},
      byCity: [],
    });
  });

  it("11. output contains no raw/session/private fields", () => {
    const out = normalizePresenceSummary({
      live_users: 2,
      by_country: { US: 2 },
      by_city: [{ city: "Austin", country_code: "US", count: 2 }],
      session_id: "leak",
      first_seen_at: "x",
      last_seen_at: "y",
      ip: "1.2.3.4",
      latitude: 1,
      longitude: 2,
    });
    const json = JSON.stringify(out);
    assert.equal("session_id" in out, false);
    assert.equal("sessionId" in out, false);
    assert.equal("ip" in out, false);
    assert.equal("latitude" in out, false);
    assert.equal("longitude" in out, false);
    assert.equal("first_seen_at" in out, false);
    assert.equal("last_seen_at" in out, false);
    assert.ok(!json.includes("leak"));
    assert.ok(!json.includes("1.2.3.4"));
    assert.deepEqual(Object.keys(out).sort(), [
      "byCity",
      "byCountry",
      "liveUsers",
    ]);
  });
});

describe("loadPresenceSummary", () => {
  it("9. missing view row → empty 200 path", async () => {
    const supabase = {
      from() {
        return {
          select() {
            return {
              maybeSingle: async () => ({ data: null, error: null }),
            };
          },
        };
      },
    } as unknown as PresenceSupabase;

    const result = await loadPresenceSummary(supabase);
    assert.deepEqual(result, {
      ok: true,
      summary: { liveUsers: 0, byCountry: {}, byCity: [] },
    });
  });

  it("10. Supabase error → generic failure", async () => {
    const supabase = {
      from() {
        return {
          select() {
            return {
              maybeSingle: async () => ({
                data: null,
                error: { message: "permission denied for table presence" },
              }),
            };
          },
        };
      },
    } as unknown as PresenceSupabase;

    const result = await loadPresenceSummary(supabase);
    assert.deepEqual(result, { ok: false, error: "summary_unavailable" });
  });
});
