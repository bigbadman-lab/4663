/**
 * pools_swaps discovery-before-activity: Instant cursor must cover the range end.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChainRpc } from "@/lib/worker/chain/rpc";
import { createPoolsWorkerMemory } from "@/lib/worker/pools/state";
import {
  catchUpPoolsSwapCursor,
  catchUpPoolsSwapCursorIsolated,
} from "@/lib/worker/pools/swap-loop";
import type { WorkerSupabase } from "@/lib/worker/supabase";

function cursorRow(stream: string, last: number | null) {
  if (last === null) return { data: null, error: null };
  return {
    data: {
      stream_name: stream,
      chain_id: 4663,
      last_processed_block: last,
    },
    error: null,
  };
}

describe("catchUpPoolsSwapCursor discovery invariant", () => {
  it("does not advance pools_swaps when Instant cursor is missing", async () => {
    const upserts: unknown[] = [];
    let cursorLoads = 0;
    const supabase = {
      from(table: string) {
        assert.equal(table, "chain_cursors");
        return {
          select() {
            return {
              eq(col: string, value: unknown) {
                assert.equal(col, "stream_name");
                const stream = String(value);
                return {
                  eq() {
                    return {
                      maybeSingle: async () => {
                        cursorLoads += 1;
                        if (stream === "pools_swaps") {
                          return cursorRow("pools_swaps", 10);
                        }
                        return cursorRow("pools_instant", null);
                      },
                    };
                  },
                };
              },
            };
          },
          upsert(payload: unknown) {
            upserts.push(payload);
            return {
              select() {
                return {
                  single: async () => ({
                    data: payload,
                    error: null,
                  }),
                };
              },
            };
          },
        };
      },
    } as unknown as WorkerSupabase;

    const rpc = {
      async getBlockNumber() {
        return 20;
      },
    } as unknown as ChainRpc;

    const result = await catchUpPoolsSwapCursor({
      rpc,
      supabase,
      chainId: 4663,
      memory: createPoolsWorkerMemory(),
      startupRewind: false,
    });

    assert.equal(result.blocked, true);
    assert.deepEqual(result.failures, ["pools_instant cursor missing"]);
    assert.equal(result.advanced, false);
    assert.equal(result.lastProcessedBlock, 10);
    assert.equal(upserts.length, 0);
    assert.ok(cursorLoads >= 2);
  });

  it("does not advance pools_swaps when Instant cursor is behind the range end", async () => {
    const upserts: Array<Record<string, unknown>> = [];
    const supabase = {
      from(table: string) {
        if (table === "chain_cursors") {
          return {
            select() {
              return {
                eq(col: string, value: unknown) {
                  const stream = String(value);
                  return {
                    eq() {
                      return {
                        maybeSingle: async () => {
                          if (stream === "pools_swaps") {
                            return cursorRow("pools_swaps", 10);
                          }
                          return cursorRow("pools_instant", 12);
                        },
                      };
                    },
                  };
                },
              };
            },
            upsert(payload: Record<string, unknown>) {
              upserts.push(payload);
              return {
                select() {
                  return {
                    single: async () => ({
                      data: {
                        stream_name: payload.stream_name,
                        chain_id: payload.chain_id,
                        last_processed_block: payload.last_processed_block,
                      },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as unknown as WorkerSupabase;

    const rpc = {
      async getBlockNumber() {
        return 20;
      },
      async getLogs() {
        return [];
      },
      async getBlock(blockNumber: number) {
        return { number: blockNumber, timestamp: 1_700_000_000 };
      },
    } as unknown as ChainRpc;

    const result = await catchUpPoolsSwapCursor({
      rpc,
      supabase,
      chainId: 4663,
      memory: createPoolsWorkerMemory(),
      startupRewind: false,
      maxOuterRangeBlocks: 10,
      maxRanges: 1,
    });

    assert.equal(result.blocked, true);
    assert.ok(result.failures.some((f) => f.includes("pools_instant lag")));
    assert.equal(
      upserts.some((u) => u.stream_name === "pools_swaps"),
      false,
    );
  });

  it("nested Instant catch-up is bounded; swaps cannot outrun Instant", async () => {
    const cursors: Record<string, number> = {
      pools_instant: 50,
      pools_swaps: 3_999_000,
    };
    let instantUpserts = 0;
    const getLogsCalls: number[] = [];
    const supabase = {
      from(table: string) {
        if (table !== "chain_cursors") {
          throw new Error(`unexpected table ${table}`);
        }
        return {
          select() {
            return {
              eq(_col: string, value: unknown) {
                const stream = String(value);
                return {
                  eq() {
                    return {
                      maybeSingle: async () => ({
                        data: {
                          stream_name: stream,
                          chain_id: 4663,
                          last_processed_block: cursors[stream],
                        },
                        error: null,
                      }),
                    };
                  },
                };
              },
            };
          },
          upsert(payload: {
            stream_name: string;
            last_processed_block: number;
          }) {
            cursors[payload.stream_name] = payload.last_processed_block;
            if (payload.stream_name === "pools_instant") instantUpserts += 1;
            return {
              select() {
                return {
                  single: async () => ({
                    data: {
                      stream_name: payload.stream_name,
                      chain_id: 4663,
                      last_processed_block: payload.last_processed_block,
                    },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      },
    } as unknown as WorkerSupabase;

    const rpc = {
      async getBlockNumber() {
        return 4_000_000;
      },
      async getLogs() {
        getLogsCalls.push(1);
        return [];
      },
      async getBlock(blockNumber: number) {
        return { number: blockNumber, timestamp: 1_700_000_000 };
      },
    } as unknown as ChainRpc;

    const result = await catchUpPoolsSwapCursor({
      rpc,
      supabase,
      chainId: 4663,
      memory: createPoolsWorkerMemory(),
      startupRewind: false,
      maxOuterRangeBlocks: 10,
      maxRanges: 1,
    });

    assert.equal(result.advanced, false);
    assert.equal(result.blocked, true);
    assert.ok(result.failures.some((f) => f.includes("pools_instant lag")));
    assert.equal(result.lastProcessedBlock, 3_999_000);
    assert.equal(cursors.pools_swaps, 3_999_000);
    assert.equal(instantUpserts, 1);
    assert.equal(cursors.pools_instant, 60);
    assert.ok(getLogsCalls.length >= 1);
    assert.ok(getLogsCalls.length < 50);
  });

  it("swap errors stay isolated and do not throw", async () => {
    const result = await catchUpPoolsSwapCursorIsolated({
      rpc: {
        async getBlockNumber() {
          throw new Error("rpc down");
        },
      } as unknown as ChainRpc,
      supabase: {
        from() {
          throw new Error("should not query after rpc failure");
        },
      } as unknown as WorkerSupabase,
      chainId: 4663,
      memory: createPoolsWorkerMemory(),
      startupRewind: false,
      maxRanges: 1,
    });
    assert.equal(result, null);
  });
});
