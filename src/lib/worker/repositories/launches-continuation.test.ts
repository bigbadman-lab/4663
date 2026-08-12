/**
 * Batched loadContinuationEventTokenAddresses (startup reconstruction).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONTINUATION_EVENT_TOKEN_IN_BATCH_SIZE,
  loadContinuationEventTokenAddresses,
} from "@/lib/worker/repositories/launches";
import type { WorkerSupabase } from "@/lib/worker/supabase";

function tokenAt(i: number): string {
  return `0x${(i + 1).toString(16).padStart(40, "0")}`;
}

type MockOpts = {
  /** Fail when batchIndex (0-based) matches */
  failBatchIndex?: number;
  failMessage?: string;
  failCode?: string;
  failDetails?: string;
  failHint?: string;
  /** Which tokens in a batch should be returned as continuation rows */
  continuationTokens?: Set<string>;
};

function createMockSupabase(opts: MockOpts = {}) {
  const inCalls: string[][] = [];
  let queryCount = 0;
  let fromCalls = 0;

  const continuationTokens =
    opts.continuationTokens ??
    new Set<string>(); /* default: none have continuation */

  const supabase = {
    from(table: string) {
      assert.equal(table, "events");
      fromCalls += 1;
      return {
        select(cols: string) {
          assert.equal(cols, "token_address");
          return {
            eq(col: string, value: unknown) {
              assert.equal(col, "chain_id");
              assert.equal(value, 4663);
              return {
                eq(col2: string, value2: unknown) {
                  assert.equal(col2, "event_type");
                  assert.equal(value2, "pons_buyer_continuation");
                  return {
                    in(col3: string, batch: string[]) {
                      assert.equal(col3, "token_address");
                      const batchIndex = inCalls.length;
                      inCalls.push([...batch]);
                      queryCount += 1;

                      const fail =
                        opts.failBatchIndex !== undefined &&
                        batchIndex === opts.failBatchIndex;
                      if (fail) {
                        return Promise.resolve({
                          data: null,
                          error: {
                            message: opts.failMessage ?? "Bad Request",
                            code: opts.failCode,
                            details: opts.failDetails,
                            hint: opts.failHint,
                          },
                        });
                      }

                      const data = batch
                        .filter((token) => continuationTokens.has(token))
                        .map((token_address) => ({ token_address }));
                      return Promise.resolve({ data, error: null });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as WorkerSupabase;

  return {
    supabase,
    inCalls,
    get queryCount() {
      return queryCount;
    },
    get fromCalls() {
      return fromCalls;
    },
  };
}

describe("loadContinuationEventTokenAddresses batching", () => {
  it("A. empty input → empty Set, no query", async () => {
    const mock = createMockSupabase();
    const result = await loadContinuationEventTokenAddresses(
      mock.supabase,
      4663,
      [],
    );
    assert.equal(result.size, 0);
    assert.equal(mock.queryCount, 0);
    assert.equal(mock.fromCalls, 0);
  });

  it("B. below batch boundary (50) → one query, correct Set", async () => {
    const tokens = Array.from({ length: 50 }, (_, i) => tokenAt(i));
    const continued = new Set([tokenAt(0), tokenAt(7), tokenAt(49)]);
    const mock = createMockSupabase({ continuationTokens: continued });
    const result = await loadContinuationEventTokenAddresses(
      mock.supabase,
      4663,
      tokens,
    );
    assert.equal(CONTINUATION_EVENT_TOKEN_IN_BATCH_SIZE, 100);
    assert.equal(mock.queryCount, 1);
    assert.equal(mock.inCalls[0]!.length, 50);
    assert.deepEqual([...result].sort(), [...continued].sort());
  });

  it("C. exact boundary (100) → one query", async () => {
    const tokens = Array.from({ length: 100 }, (_, i) => tokenAt(i));
    const mock = createMockSupabase({
      continuationTokens: new Set([tokenAt(0), tokenAt(99)]),
    });
    const result = await loadContinuationEventTokenAddresses(
      mock.supabase,
      4663,
      tokens,
    );
    assert.equal(mock.queryCount, 1);
    assert.equal(mock.inCalls[0]!.length, 100);
    assert.equal(result.size, 2);
    assert.ok(result.has(tokenAt(0)));
    assert.ok(result.has(tokenAt(99)));
  });

  it("D. over boundary (101) → two queries, sizes 100+1, unioned", async () => {
    const tokens = Array.from({ length: 101 }, (_, i) => tokenAt(i));
    const continued = new Set([tokenAt(0), tokenAt(100)]);
    const mock = createMockSupabase({ continuationTokens: continued });
    const result = await loadContinuationEventTokenAddresses(
      mock.supabase,
      4663,
      tokens,
    );
    assert.equal(mock.queryCount, 2);
    assert.equal(mock.inCalls[0]!.length, 100);
    assert.equal(mock.inCalls[1]!.length, 1);
    assert.equal(mock.inCalls[1]![0], tokenAt(100));
    assert.deepEqual([...result].sort(), [...continued].sort());
  });

  it("E. production-scale (614) → 7 queries, max batch 100, unioned", async () => {
    const tokens = Array.from({ length: 614 }, (_, i) => tokenAt(i));
    const continued = new Set([
      tokenAt(0),
      tokenAt(99),
      tokenAt(100),
      tokenAt(500),
      tokenAt(613),
    ]);
    const mock = createMockSupabase({ continuationTokens: continued });
    const result = await loadContinuationEventTokenAddresses(
      mock.supabase,
      4663,
      tokens,
    );
    assert.equal(mock.queryCount, 7);
    assert.ok(mock.inCalls.every((batch) => batch.length <= 100));
    assert.ok(mock.inCalls.every((batch) => batch.length < 614));
    assert.equal(mock.inCalls[0]!.length, 100);
    assert.equal(mock.inCalls[5]!.length, 100);
    assert.equal(mock.inCalls[6]!.length, 14);
    assert.deepEqual([...result].sort(), [...continued].sort());
  });

  it("F. duplicates + mixed case normalize/dedupe before batching", async () => {
    const a = tokenAt(1);
    const b = tokenAt(2);
    const tokens = [
      a,
      a.toUpperCase(),
      b,
      b,
      ...Array.from({ length: 99 }, (_, i) => tokenAt(i + 10)),
    ];
    // unique: a, b, +99 = 101 → 2 batches
    const mock = createMockSupabase({
      continuationTokens: new Set([a, tokenAt(10)]),
    });
    const result = await loadContinuationEventTokenAddresses(
      mock.supabase,
      4663,
      tokens,
    );
    assert.equal(mock.queryCount, 2);
    const allQueried = mock.inCalls.flat();
    assert.equal(allQueried.length, 101);
    assert.equal(new Set(allQueried).size, 101);
    assert.ok(allQueried.every((t) => t === t.toLowerCase()));
    assert.equal(result.size, 2);
    assert.ok(result.has(a));
    assert.ok(result.has(tokenAt(10)));
  });

  it("G. later batch failure throws with batch index; no successful return", async () => {
    const mock = createMockSupabase({
      failBatchIndex: 1,
      failMessage: "Bad Request",
      failCode: "PGRST301",
      failDetails: "request too large",
      failHint: "reduce filter size",
      continuationTokens: new Set([tokenAt(0)]),
    });
    const tokens = Array.from({ length: 250 }, (_, i) => tokenAt(i));
    await assert.rejects(
      () =>
        loadContinuationEventTokenAddresses(mock.supabase, 4663, tokens),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(
          err.message,
          /loadContinuationEventTokenAddresses batch 2\/3 \(100 addresses\) failed/,
        );
        assert.match(err.message, /Bad Request/);
        assert.match(err.message, /code=PGRST301/);
        assert.match(err.message, /details=request too large/);
        assert.match(err.message, /hint=reduce filter size/);
        return true;
      },
    );
    // Second batch failed; third never run
    assert.equal(mock.queryCount, 2);
  });
});
