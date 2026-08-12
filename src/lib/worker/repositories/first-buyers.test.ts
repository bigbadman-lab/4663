/**
 * Stage 7B — batched loadFirstBuyersForTokens (restart reconstruction).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FIRST_BUYERS_TOKEN_IN_BATCH_SIZE,
  loadFirstBuyersForTokens,
} from "@/lib/worker/repositories/first-buyers";
import type { WorkerSupabase } from "@/lib/worker/supabase";

function tokenAt(i: number): string {
  return `0x${(i + 1).toString(16).padStart(40, "0")}`;
}

function walletAt(i: number): string {
  return `0x${(i + 100).toString(16).padStart(40, "0")}`;
}

function buyerRow(opts: {
  token: string;
  wallet: string;
  ts: string;
  block?: number;
}) {
  return {
    chain_id: 4663,
    token_address: opts.token,
    wallet_address: opts.wallet,
    first_buy_tx_hash:
      "0x" + opts.wallet.slice(2).padEnd(64, "0").slice(0, 64),
    first_buy_block_number: opts.block ?? 1,
    first_buy_block_timestamp: opts.ts,
  };
}

type MockOpts = {
  /** Fail when batchIndex (0-based) matches */
  failBatchIndex?: number;
  failMessage?: string;
};

function createMockSupabase(opts: MockOpts = {}) {
  const inCalls: string[][] = [];
  let queryCount = 0;

  const supabase = {
    from(table: string) {
      assert.equal(table, "pons_first_buyers");
      return {
        select() {
          return {
            eq(col: string, value: unknown) {
              assert.equal(col, "chain_id");
              assert.equal(value, 4663);
              return {
                in(col: string, batch: string[]) {
                  assert.equal(col, "token_address");
                  const batchIndex = inCalls.length;
                  inCalls.push([...batch]);
                  queryCount += 1;
                  return {
                    order() {
                      const fail =
                        opts.failBatchIndex !== undefined &&
                        batchIndex === opts.failBatchIndex;
                      if (fail) {
                        return Promise.resolve({
                          data: null,
                          error: {
                            message: opts.failMessage ?? "Bad Request",
                          },
                        });
                      }
                      // One synthetic buyer per token in this batch
                      const data = batch.map((token, i) =>
                        buyerRow({
                          token,
                          wallet: walletAt(batchIndex * 1000 + i),
                          // Deliberately reverse-ish so global sort is tested
                          ts: new Date(
                            1_700_000_000_000 +
                              (1000 - batchIndex) * 10_000 -
                              i * 1000,
                          ).toISOString(),
                        }),
                      );
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

  return { supabase, inCalls, get queryCount() { return queryCount; } };
}

describe("loadFirstBuyersForTokens batching", () => {
  it("1. empty token list → no query, []", async () => {
    const mock = createMockSupabase();
    const rows = await loadFirstBuyersForTokens(mock.supabase, 4663, []);
    assert.deepEqual(rows, []);
    assert.equal(mock.queryCount, 0);
  });

  it("2. ≤100 unique tokens → one query", async () => {
    const mock = createMockSupabase();
    const tokens = Array.from({ length: 100 }, (_, i) => tokenAt(i));
    const rows = await loadFirstBuyersForTokens(mock.supabase, 4663, tokens);
    assert.equal(mock.queryCount, 1);
    assert.equal(mock.inCalls[0]!.length, 100);
    assert.equal(rows.length, 100);
  });

  it("3. >100 unique tokens → correct sequential query count", async () => {
    const mock = createMockSupabase();
    const tokens = Array.from({ length: 250 }, (_, i) => tokenAt(i));
    const rows = await loadFirstBuyersForTokens(mock.supabase, 4663, tokens);
    assert.equal(FIRST_BUYERS_TOKEN_IN_BATCH_SIZE, 100);
    assert.equal(mock.queryCount, 3);
    assert.equal(mock.inCalls[0]!.length, 100);
    assert.equal(mock.inCalls[1]!.length, 100);
    assert.equal(mock.inCalls[2]!.length, 50);
    assert.equal(rows.length, 250);
    // Sequential: each call recorded in order
    assert.equal(mock.inCalls[0]![0], tokenAt(0));
    assert.equal(mock.inCalls[1]![0], tokenAt(100));
    assert.equal(mock.inCalls[2]![0], tokenAt(200));
  });

  it("4. duplicate input addresses are deduplicated before batching", async () => {
    const mock = createMockSupabase();
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
    await loadFirstBuyersForTokens(mock.supabase, 4663, tokens);
    assert.equal(mock.queryCount, 2);
    const allQueried = mock.inCalls.flat();
    assert.equal(allQueried.length, 101);
    assert.equal(new Set(allQueried).size, 101);
  });

  it("5. merged results globally sorted by timestamp then wallet", async () => {
    const mock = createMockSupabase();
    const tokens = Array.from({ length: 101 }, (_, i) => tokenAt(i));
    const rows = await loadFirstBuyersForTokens(mock.supabase, 4663, tokens);
    for (let i = 1; i < rows.length; i++) {
      const prev = Date.parse(rows[i - 1]!.firstBuyBlockTimestamp);
      const cur = Date.parse(rows[i]!.firstBuyBlockTimestamp);
      assert.ok(prev <= cur);
      if (prev === cur) {
        assert.ok(
          rows[i - 1]!.walletAddress <= rows[i]!.walletAddress,
        );
      }
    }

    const tieMock = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  in() {
                    return {
                      order() {
                        return Promise.resolve({
                          data: [
                            buyerRow({
                              token: tokenAt(0),
                              wallet:
                                "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                              ts: "2024-06-01T12:00:00.000Z",
                            }),
                            buyerRow({
                              token: tokenAt(1),
                              wallet:
                                "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                              ts: "2024-06-01T12:00:00.000Z",
                            }),
                            buyerRow({
                              token: tokenAt(2),
                              wallet:
                                "0xcccccccccccccccccccccccccccccccccccccccc",
                              ts: "2024-06-01T11:00:00.000Z",
                            }),
                          ],
                          error: null,
                        });
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

    const sorted = await loadFirstBuyersForTokens(tieMock, 4663, [
      tokenAt(0),
      tokenAt(1),
      tokenAt(2),
    ]);
    assert.equal(
      sorted[0]!.walletAddress,
      "0xcccccccccccccccccccccccccccccccccccccccc",
    );
    assert.equal(
      sorted[1]!.walletAddress,
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    assert.equal(
      sorted[2]!.walletAddress,
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
  });

  it("6–7. middle-batch failure throws with batch index/size; no partial return", async () => {
    const mock = createMockSupabase({
      failBatchIndex: 1,
      failMessage: "Bad Request",
    });
    const tokens = Array.from({ length: 250 }, (_, i) => tokenAt(i));
    await assert.rejects(
      () => loadFirstBuyersForTokens(mock.supabase, 4663, tokens),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Bad Request/);
        assert.match(err.message, /batch 2\/3/);
        assert.match(err.message, /size=100/);
        return true;
      },
    );
    // Second batch failed; third never run
    assert.equal(mock.queryCount, 2);
  });
});
