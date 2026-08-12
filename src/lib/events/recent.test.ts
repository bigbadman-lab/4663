/**
 * Stage 9B — recent public events API: limit, normalize, load.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isProductionLaunchBlock,
  normalizePublicEvent,
  safeLaunchBlockFromPayload,
} from "@/lib/events/normalize";
import {
  loadRecentPublicEvents,
  parseRecentEventsLimit,
  RECENT_EVENTS_DEFAULT_LIMIT,
  RECENT_EVENTS_FETCH_MULTIPLIER,
  RECENT_EVENTS_MAX_LIMIT,
  RECENT_EVENTS_MIN_LIMIT,
} from "@/lib/events/recent";
import type { SupabaseClient } from "@supabase/supabase-js";

const PROD_B = BigInt("34002666");
const ID_A = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const ID_B = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ID_A,
    event_type: "pons_buying_activity",
    token_address: "0xABCDEF0123456789ABCDEF0123456789ABCDEF01",
    new_buyers: 12,
    occurred_at: "2026-08-12T10:00:00.000Z",
    trigger_block_number: 34400000,
    trigger_tx_hash: null,
    payload: { factory_version: "v2", launch_block_number: 34002667 },
    ...overrides,
  };
}

describe("parseRecentEventsLimit", () => {
  it("1. default limit 20", () => {
    assert.equal(parseRecentEventsLimit(null), RECENT_EVENTS_DEFAULT_LIMIT);
    assert.equal(parseRecentEventsLimit(undefined), RECENT_EVENTS_DEFAULT_LIMIT);
    assert.equal(parseRecentEventsLimit(""), RECENT_EVENTS_DEFAULT_LIMIT);
    assert.equal(parseRecentEventsLimit("  "), RECENT_EVENTS_DEFAULT_LIMIT);
  });

  it("2. min/max limit handling", () => {
    assert.equal(parseRecentEventsLimit("1"), RECENT_EVENTS_MIN_LIMIT);
    assert.equal(parseRecentEventsLimit("50"), RECENT_EVENTS_MAX_LIMIT);
    assert.equal(parseRecentEventsLimit("0"), RECENT_EVENTS_MIN_LIMIT);
    assert.equal(parseRecentEventsLimit("-3"), RECENT_EVENTS_MIN_LIMIT);
    assert.equal(parseRecentEventsLimit("51"), RECENT_EVENTS_MAX_LIMIT);
    assert.equal(parseRecentEventsLimit("999"), RECENT_EVENTS_MAX_LIMIT);
  });

  it("3. invalid limit handling", () => {
    assert.equal(parseRecentEventsLimit("abc"), RECENT_EVENTS_DEFAULT_LIMIT);
    assert.equal(parseRecentEventsLimit("NaN"), RECENT_EVENTS_DEFAULT_LIMIT);
    assert.equal(parseRecentEventsLimit("20.9"), 20);
    assert.equal(parseRecentEventsLimit("7.1"), 7);
  });
});

describe("normalizePublicEvent / safeLaunchBlockFromPayload", () => {
  it("4. DTO-only response shape", () => {
    const dto = normalizePublicEvent(validRow());
    assert.ok(dto);
    assert.deepEqual(Object.keys(dto!).sort(), [
      "id",
      "newBuyers",
      "occurredAt",
      "tokenAddress",
      "triggerBlockNumber",
      "triggerTxHash",
      "type",
    ]);
    assert.equal(dto!.type, "pons_buying_activity");
    assert.equal(
      "payload" in dto! || "marketAddress" in dto! || "created_at" in dto!,
      false,
    );
  });

  it("5. nullable triggerTxHash", () => {
    assert.equal(normalizePublicEvent(validRow())!.triggerTxHash, null);
    assert.equal(
      normalizePublicEvent(
        validRow({
          trigger_tx_hash:
            "0xABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789",
        }),
      )!.triggerTxHash,
      "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    );
  });

  it("6. normalized token/hash casing", () => {
    const dto = normalizePublicEvent(
      validRow({
        token_address: "0xABCDEF0123456789ABCDEF0123456789ABCDEF01",
        trigger_tx_hash:
          "0xABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789",
      }),
    );
    assert.equal(
      dto!.tokenAddress,
      "0xabcdef0123456789abcdef0123456789abcdef01",
    );
    assert.equal(
      dto!.triggerTxHash,
      "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    );
  });

  it("8. malformed rows handled safely (discard)", () => {
    assert.equal(normalizePublicEvent(null), null);
    assert.equal(normalizePublicEvent({}), null);
    assert.equal(normalizePublicEvent(validRow({ id: "not-uuid" })), null);
    assert.equal(
      normalizePublicEvent(validRow({ event_type: "other" })),
      null,
    );
    assert.equal(
      normalizePublicEvent(validRow({ token_address: "0xgg" })),
      null,
    );
    assert.equal(normalizePublicEvent(validRow({ new_buyers: 0 })), null);
    assert.equal(
      normalizePublicEvent(validRow({ occurred_at: "not-a-date" })),
      null,
    );
    assert.equal(
      normalizePublicEvent(validRow({ trigger_tx_hash: "0xdead" })),
      null,
    );
  });

  it("11. no raw payload/internal fields leak", () => {
    const dto = normalizePublicEvent(
      validRow({
        market_address: "0x1111111111111111111111111111111111111111",
        created_at: "2026-01-01T00:00:00Z",
        window_seconds: 180,
        token_age_seconds: 200,
        source: "pons",
      }),
    );
    assert.ok(dto);
    const json = JSON.stringify(dto);
    assert.equal(json.includes("payload"), false);
    assert.equal(json.includes("market_address"), false);
    assert.equal(json.includes("marketAddress"), false);
    assert.equal(json.includes("created_at"), false);
    assert.equal(json.includes("factory_version"), false);
    assert.equal(json.includes("launch_block"), false);
    assert.equal(json.includes("window_seconds"), false);
  });

  it("safe launch block parser fail-closed", () => {
    assert.equal(safeLaunchBlockFromPayload({}), null);
    assert.equal(
      safeLaunchBlockFromPayload({ launch_block_number: "nope" }),
      null,
    );
    assert.equal(safeLaunchBlockFromPayload({ launch_block_number: -1 }), null);
    assert.equal(
      safeLaunchBlockFromPayload({ launch_block_number: 12.5 }),
      null,
    );
    assert.equal(
      safeLaunchBlockFromPayload({
        launch_block_number: "9223372036854775808",
      }),
      null,
    );
    assert.equal(safeLaunchBlockFromPayload(null), null);
    assert.equal(
      safeLaunchBlockFromPayload({ launch_block_number: 34002667 }),
      BigInt("34002667"),
    );
    assert.equal(isProductionLaunchBlock({ launch_block_number: 34002666 }, PROD_B), false);
    assert.equal(isProductionLaunchBlock({ launch_block_number: 34002667 }, PROD_B), true);
  });
});

type MockResult = { data: unknown; error: { message: string } | null };

function mockSupabase(opts: {
  state?: MockResult;
  events?: MockResult;
  onEventsQuery?: (q: {
    eq: Record<string, unknown>;
    order: Array<{ col: string; ascending: boolean }>;
    limit: number;
  }) => void;
}): SupabaseClient {
  const stateResult: MockResult = opts.state ?? {
    data: { production_start_block: 34002666 },
    error: null,
  };
  const eventsResult: MockResult = opts.events ?? { data: [], error: null };

  const eventsQuery = {
    eqCalls: {} as Record<string, unknown>,
    orderCalls: [] as Array<{ col: string; ascending: boolean }>,
    limitVal: 0,
    select() {
      return this;
    },
    eq(col: string, val: unknown) {
      this.eqCalls[col] = val;
      return this;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      this.orderCalls.push({ col, ascending: opts?.ascending !== false });
      return this;
    },
    limit(n: number) {
      this.limitVal = n;
      opts.onEventsQuery?.({
        eq: { ...this.eqCalls },
        order: [...this.orderCalls],
        limit: n,
      });
      return Promise.resolve(eventsResult);
    },
  };

  const stateQuery = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    maybeSingle() {
      return Promise.resolve(stateResult);
    },
  };

  return {
    from(table: string) {
      if (table === "production_state") return stateQuery;
      if (table === "events") return eventsQuery;
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
}

describe("loadRecentPublicEvents", () => {
  it("7. deterministic ordering (occurred_at DESC, id ASC)", async () => {
    let seen: {
      order: Array<{ col: string; ascending: boolean }>;
      limit: number;
    } | null = null;
    const supabase = mockSupabase({
      onEventsQuery: (q) => {
        seen = q;
      },
      events: {
        data: [
          validRow({
            id: ID_B,
            occurred_at: "2026-08-12T11:00:00.000Z",
            payload: { launch_block_number: 34002670 },
          }),
          validRow({
            id: ID_A,
            occurred_at: "2026-08-12T11:00:00.000Z",
            payload: { launch_block_number: 34002671 },
          }),
        ],
        error: null,
      },
    });

    const result = await loadRecentPublicEvents(supabase, 20);
    assert.equal(result.ok, true);
    assert.deepEqual(seen!.order, [
      { col: "occurred_at", ascending: false },
      { col: "id", ascending: true },
    ]);
    assert.equal(seen!.limit, 20 * RECENT_EVENTS_FETCH_MULTIPLIER);
  });

  it("over-fetch fills safeLimit when non-prod rows occupy the top window", async () => {
    let fetchLimit = 0;
    const safeLimit = 5;
    // First 5 are pre-boundary; next 5 are production — without over-fetch we'd return 0.
    const rows = [
      ...Array.from({ length: 5 }, (_, i) =>
        validRow({
          id: `bbbbbbbb-bbbb-cccc-dddd-${String(i).padStart(12, "0")}`,
          occurred_at: new Date(Date.UTC(2026, 7, 12, 12, 0, 5 - i)).toISOString(),
          payload: { launch_block_number: 34002666 },
        }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        validRow({
          id: `aaaaaaaa-bbbb-cccc-dddd-${String(i).padStart(12, "0")}`,
          occurred_at: new Date(Date.UTC(2026, 7, 12, 11, 0, 5 - i)).toISOString(),
          payload: { launch_block_number: 34002667 + i },
        }),
      ),
    ];

    const result = await loadRecentPublicEvents(
      mockSupabase({
        events: { data: rows, error: null },
        onEventsQuery: (q) => {
          fetchLimit = q.limit;
        },
      }),
      safeLimit,
    );

    assert.equal(fetchLimit, safeLimit * RECENT_EVENTS_FETCH_MULTIPLIER);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body.events.length, safeLimit);
    assert.ok(
      result.body.events.every((e) => e.id.startsWith("aaaaaaaa-")),
    );
  });

  it("output capped at requested limit; DB fetch bounded", async () => {
    let fetchLimit = 0;
    const rows = Array.from({ length: 30 }, (_, i) =>
      validRow({
        id: `aaaaaaaa-bbbb-cccc-dddd-${String(i).padStart(12, "0")}`,
        occurred_at: new Date(Date.UTC(2026, 7, 12, 10, 0, 30 - i)).toISOString(),
        payload: { launch_block_number: 34002667 + i },
      }),
    );

    const result = await loadRecentPublicEvents(
      mockSupabase({
        events: { data: rows, error: null },
        onEventsQuery: (q) => {
          fetchLimit = q.limit;
        },
      }),
      5,
    );

    assert.equal(fetchLimit, 5 * RECENT_EVENTS_FETCH_MULTIPLIER);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body.events.length, 5);
  });

  it("9. empty DB → { events: [] }", async () => {
    const result = await loadRecentPublicEvents(
      mockSupabase({ events: { data: [], error: null } }),
      20,
    );
    assert.deepEqual(result, { ok: true, body: { events: [] } });
  });

  it("10. DB failure → generic unavailable", async () => {
    const stateFail = await loadRecentPublicEvents(
      mockSupabase({
        state: { data: null, error: { message: "boom" } },
      }),
      20,
    );
    assert.deepEqual(stateFail, { ok: false, error: "events_unavailable" });

    const eventsFail = await loadRecentPublicEvents(
      mockSupabase({
        events: { data: null, error: { message: "sql exploded" } },
      }),
      20,
    );
    assert.deepEqual(eventsFail, { ok: false, error: "events_unavailable" });

    const missingCutover = await loadRecentPublicEvents(
      mockSupabase({
        state: { data: null, error: null },
      }),
      20,
    );
    assert.deepEqual(missingCutover, {
      ok: false,
      error: "events_unavailable",
    });
  });

  it("12. max 50 events returned + production filter + DTO shape", async () => {
    const rows = Array.from({ length: 50 }, (_, i) =>
      validRow({
        id: `aaaaaaaa-bbbb-cccc-dddd-${String(i).padStart(12, "0")}`,
        new_buyers: 5 + (i % 3),
        occurred_at: new Date(Date.UTC(2026, 7, 12, 10, 0, i)).toISOString(),
        payload: { launch_block_number: 34002667 + i },
        market_address: "0x1111111111111111111111111111111111111111",
        created_at: "secret",
      }),
    );
    // Pre-boundary row must not appear in output
    rows.push(
      validRow({
        id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        payload: { launch_block_number: 34002666 },
        occurred_at: "2026-08-12T12:00:00.000Z",
      }),
    );

    const result = await loadRecentPublicEvents(
      mockSupabase({
        events: { data: rows, error: null },
        onEventsQuery: (q) => {
          assert.equal(q.limit, 50 * RECENT_EVENTS_FETCH_MULTIPLIER);
          assert.ok(q.limit <= RECENT_EVENTS_MAX_LIMIT * RECENT_EVENTS_FETCH_MULTIPLIER);
          assert.equal(q.eq.chain_id, 4663);
          assert.equal(q.eq.event_type, "pons_buying_activity");
          assert.equal(q.eq.source, "pons");
        },
      }),
      50,
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body.events.length, 50);
    assert.equal(
      result.body.events.some((e) => e.id === "ffffffff-ffff-ffff-ffff-ffffffffffff"),
      false,
    );
    for (const e of result.body.events) {
      assert.equal(Object.hasOwn(e, "payload"), false);
      assert.equal(Object.hasOwn(e, "marketAddress"), false);
      assert.equal(e.type, "pons_buying_activity");
    }
  });

  it("discards malformed rows in load path", async () => {
    const result = await loadRecentPublicEvents(
      mockSupabase({
        events: {
          data: [
            validRow(),
            validRow({ id: "bad", payload: { launch_block_number: 34002699 } }),
            null,
          ],
          error: null,
        },
      }),
      20,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body.events.length, 1);
    assert.equal(result.body.events[0]!.id, ID_A);
  });
});
