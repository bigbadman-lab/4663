/**
 * Stage 9C — browser public events stream (merge, Realtime lifecycle, env).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PublicEventsStreamController,
  PUBLIC_EVENTS_FETCH_RETRY_MS,
} from "@/lib/events/browser-stream";
import { MAX_PUBLIC_EVENTS, mergePublicEvents } from "@/lib/events/merge";
import type {
  EventsRealtimeClient,
  EventsRealtimeStatus,
} from "@/lib/events/realtime-client";
import { loadBrowserSupabaseEnv } from "@/lib/events/supabase-browser";
import type { PublicEvent } from "@/lib/events/types";

const ID_A = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const ID_B = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";
const ID_C = "cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee";

function dto(overrides: Partial<PublicEvent> & Pick<PublicEvent, "id">): PublicEvent {
  return {
    type: "pons_buying_activity",
    tokenAddress: "0xabcdef0123456789abcdef0123456789abcdef01",
    newBuyers: 5,
    occurredAt: "2026-08-12T10:00:00.000Z",
    triggerBlockNumber: 34400000,
    triggerTxHash: null,
    ...overrides,
  };
}

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ID_A,
    event_type: "pons_buying_activity",
    token_address: "0xABCDEF0123456789ABCDEF0123456789ABCDEF01",
    new_buyers: 8,
    occurred_at: "2026-08-12T10:05:00.000Z",
    trigger_block_number: 34400010,
    trigger_tx_hash: null,
    ...overrides,
  };
}

describe("mergePublicEvents", () => {
  it("1. merge initial fetch + realtime insert without duplicates", () => {
    const initial = [dto({ id: ID_A, occurredAt: "2026-08-12T10:00:00.000Z" })];
    const live = [
      dto({ id: ID_A, occurredAt: "2026-08-12T10:00:00.000Z", newBuyers: 9 }),
      dto({ id: ID_B, occurredAt: "2026-08-12T10:01:00.000Z" }),
    ];
    const merged = mergePublicEvents(initial, live);
    assert.equal(merged.length, 2);
    assert.equal(merged[0]!.id, ID_A);
    assert.equal(merged[0]!.newBuyers, 9);
    assert.equal(merged[1]!.id, ID_B);
  });

  it("4. ordering by occurredAt then id", () => {
    const merged = mergePublicEvents(
      [],
      [
        dto({ id: ID_B, occurredAt: "2026-08-12T10:00:00.000Z" }),
        dto({ id: ID_A, occurredAt: "2026-08-12T10:00:00.000Z" }),
        dto({ id: ID_C, occurredAt: "2026-08-12T09:00:00.000Z" }),
      ],
    );
    assert.deepEqual(
      merged.map((e) => e.id),
      [ID_C, ID_A, ID_B],
    );
  });

  it("5. cap at 100 drops oldest", () => {
    const many = Array.from({ length: 105 }, (_, i) =>
      dto({
        id: `aaaaaaaa-bbbb-cccc-dddd-${String(i).padStart(12, "0")}`,
        occurredAt: new Date(Date.UTC(2026, 7, 12, 0, 0, i)).toISOString(),
      }),
    );
    const merged = mergePublicEvents([], many);
    assert.equal(merged.length, MAX_PUBLIC_EVENTS);
    assert.equal(merged[0]!.id, "aaaaaaaa-bbbb-cccc-dddd-000000000005");
    assert.equal(merged[merged.length - 1]!.id, "aaaaaaaa-bbbb-cccc-dddd-000000000104");
  });
});

type MockRealtime = EventsRealtimeClient & {
  emitInsert: (row: unknown) => void;
  emitStatus: (status: EventsRealtimeStatus) => void;
  unsubscribeCount: number;
  subscribeCount: number;
};

function mockRealtime(): MockRealtime {
  let onInsert: ((row: unknown) => void) | null = null;
  let onStatus: ((status: EventsRealtimeStatus) => void) | null = null;
  const client: MockRealtime = {
    subscribeCount: 0,
    unsubscribeCount: 0,
    subscribeInserts(handlers) {
      client.subscribeCount += 1;
      onInsert = handlers.onInsert;
      onStatus = handlers.onStatus;
      return {
        unsubscribe: () => {
          client.unsubscribeCount += 1;
          onInsert = null;
          onStatus = null;
        },
      };
    },
    emitInsert(row) {
      onInsert?.(row);
    },
    emitStatus(status) {
      onStatus?.(status);
    },
  };
  return client;
}

describe("PublicEventsStreamController", () => {
  it("2. realtime event arriving before initial fetch is preserved", async () => {
    const realtime = mockRealtime();
    let resolveFetch!: (events: PublicEvent[]) => void;
    const fetchPromise = new Promise<PublicEvent[]>((resolve) => {
      resolveFetch = resolve;
    });

    const snapshots: PublicEvent[][] = [];
    const statuses: string[] = [];
    const controller = new PublicEventsStreamController({
      realtime,
      fetchRecent: () => fetchPromise,
      onEvents: (e) => snapshots.push(e),
      onStatus: (s) => statuses.push(s),
    });

    controller.start();
    realtime.emitStatus("SUBSCRIBED");
    realtime.emitInsert(
      dbRow({
        id: ID_B,
        occurred_at: "2026-08-12T10:02:00.000Z",
      }),
    );

    assert.equal(snapshots.at(-1)?.some((e) => e.id === ID_B), true);

    resolveFetch([dto({ id: ID_A, occurredAt: "2026-08-12T10:00:00.000Z" })]);
    await fetchPromise;
    await Promise.resolve();

    const last = snapshots.at(-1)!;
    assert.equal(last.length, 2);
    assert.deepEqual(
      last.map((e) => e.id),
      [ID_A, ID_B],
    );
    controller.stop();
  });

  it("3. duplicate realtime delivery is ignored", () => {
    const realtime = mockRealtime();
    const snapshots: PublicEvent[][] = [];
    const controller = new PublicEventsStreamController({
      realtime,
      fetchRecent: async () => [],
      onEvents: (e) => snapshots.push(e),
      onStatus: () => {},
    });
    controller.start();
    realtime.emitStatus("SUBSCRIBED");
    const row = dbRow({ id: ID_A });
    realtime.emitInsert(row);
    realtime.emitInsert(row);
    assert.equal(snapshots.at(-1)!.length, 1);
    controller.stop();
  });

  it("6. malformed realtime row ignored", () => {
    const realtime = mockRealtime();
    const snapshots: PublicEvent[][] = [];
    const controller = new PublicEventsStreamController({
      realtime,
      fetchRecent: async () => [],
      onEvents: (e) => snapshots.push(e),
      onStatus: () => {},
    });
    controller.start();
    realtime.emitInsert({ id: "nope" });
    realtime.emitInsert(null);
    assert.equal(snapshots.length, 0);
    assert.equal(controller.getEvents().length, 0);
    controller.stop();
  });

  it("7. reconnect triggers recent refetch", async () => {
    const realtime = mockRealtime();
    let fetchCount = 0;
    const controller = new PublicEventsStreamController({
      realtime,
      fetchRecent: async () => {
        fetchCount += 1;
        return [dto({ id: ID_A, occurredAt: "2026-08-12T10:00:00.000Z" })];
      },
      onEvents: () => {},
      onStatus: () => {},
    });
    controller.start();
    realtime.emitStatus("SUBSCRIBED");
    await Promise.resolve();
    assert.equal(fetchCount, 1);

    realtime.emitStatus("CLOSED");
    realtime.emitStatus("SUBSCRIBED");
    await Promise.resolve();
    assert.equal(fetchCount, 2);
    controller.stop();
  });

  it("8. failed initial fetch does not kill realtime stream", async () => {
    const realtime = mockRealtime();
    const statuses: string[] = [];
    const snapshots: PublicEvent[][] = [];
    let fetchAttempts = 0;
    const pendingTimers: Array<() => void> = [];

    const controller = new PublicEventsStreamController({
      realtime,
      fetchRecent: async () => {
        fetchAttempts += 1;
        if (fetchAttempts === 1) throw new Error("network down");
        return [];
      },
      onEvents: (e) => snapshots.push(e),
      onStatus: (s) => statuses.push(s),
      setTimeoutFn: (handler) => {
        pendingTimers.push(handler);
        return pendingTimers.length;
      },
      clearTimeoutFn: () => {},
    });

    controller.start();
    realtime.emitStatus("SUBSCRIBED");
    await Promise.resolve();
    await Promise.resolve();

    assert.ok(statuses.includes("live"));
    assert.equal(pendingTimers.length, 1);

    realtime.emitInsert(dbRow({ id: ID_C }));
    assert.equal(snapshots.at(-1)?.some((e) => e.id === ID_C), true);

    pendingTimers[0]!();
    await Promise.resolve();
    assert.equal(fetchAttempts, 2);
    assert.equal(PUBLIC_EVENTS_FETCH_RETRY_MS, 3_000);
    controller.stop();
  });

  it("9. unmount removes channel", () => {
    const realtime = mockRealtime();
    const controller = new PublicEventsStreamController({
      realtime,
      fetchRecent: async () => [],
      onEvents: () => {},
      onStatus: () => {},
    });
    controller.start();
    assert.equal(realtime.subscribeCount, 1);
    controller.stop();
    assert.equal(realtime.unsubscribeCount, 1);
  });

  it("10. no duplicate channels across rerender (idempotent start)", () => {
    const realtime = mockRealtime();
    const controller = new PublicEventsStreamController({
      realtime,
      fetchRecent: async () => [],
      onEvents: () => {},
      onStatus: () => {},
    });
    controller.start();
    controller.start();
    controller.start();
    assert.equal(realtime.subscribeCount, 1);
    controller.stop();
  });
});

describe("browser Supabase env", () => {
  it("1. explicit env override still works", () => {
    const loaded = loadBrowserSupabaseEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub-key",
      SUPABASE_SECRET_KEY: "secret-must-not-be-used",
      SUPABASE_URL: "https://should-not-use.supabase.co",
    });
    assert.equal(loaded.supabaseUrl, "https://example.supabase.co");
    assert.equal(loaded.supabaseAnonKey, "pub-key");
  });

  it("2. missing keys still throw", () => {
    assert.throws(
      () => loadBrowserSupabaseEnv({}),
      /missing NEXT_PUBLIC_SUPABASE_URL/,
    );
    assert.throws(
      () =>
        loadBrowserSupabaseEnv({
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        }),
      /missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
  });

  it("3. publishable key preferred", () => {
    const loaded = loadBrowserSupabaseEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub-key",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });
    assert.equal(loaded.supabaseAnonKey, "pub-key");
  });

  it("4. anon key fallback works", () => {
    const viaAnon = loadBrowserSupabaseEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });
    assert.equal(viaAnon.supabaseAnonKey, "anon-key");
  });

  it("5. client module contains no SUPABASE_SECRET_KEY", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const files = [
      "supabase-browser.ts",
      "realtime-client.ts",
      "browser-stream.ts",
      "use-public-events.ts",
      "fetch-recent.ts",
    ];
    for (const name of files) {
      const source = readFileSync(path.join(dir, name), "utf8");
      assert.equal(
        source.includes("SUPABASE_SECRET_KEY"),
        false,
        `${name} must not reference SUPABASE_SECRET_KEY`,
      );
      assert.equal(
        source.includes("service_role"),
        false,
        `${name} must not reference service_role`,
      );
      assert.equal(
        source.includes("service-role"),
        false,
        `${name} must not reference service-role`,
      );
    }
  });

  it("6. default browser path uses literal static process.env.NEXT_PUBLIC_* references", () => {
    const source = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "supabase-browser.ts"),
      "utf8",
    );
    assert.match(source, /process\.env\.NEXT_PUBLIC_SUPABASE_URL/);
    assert.match(source, /process\.env\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
    assert.match(source, /process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    assert.equal(
      /=\s*process\.env\s+as\s+Record/.test(source),
      false,
      "must not default args to process.env as Record",
    );
    assert.equal(
      /env:\s*Record[^=]*=\s*process\.env/.test(source),
      false,
      "must not default env parameter to process.env",
    );
  });
});
