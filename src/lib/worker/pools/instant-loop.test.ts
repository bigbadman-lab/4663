/**
 * Instant catch-up: maxRanges bounds a large backlog to one outer range.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChainRpc } from "@/lib/worker/chain/rpc";
import { POOLS_CATCH_UP_MAX_RANGES_PER_CYCLE } from "@/lib/worker/constants";
import {
  catchUpPoolsInstantCursor,
  catchUpPoolsInstantCursorIsolated,
} from "@/lib/worker/pools/instant-loop";
import type { WorkerSupabase } from "@/lib/worker/supabase";

function cursorSupabase(initialInstant: number | null) {
  const cursors: Record<string, number | null> = {
    pools_instant: initialInstant,
  };
  const supabase = {
    from(table: string) {
      if (table !== "chain_cursors") {
        throw new Error(`unexpected table ${table}`);
      }
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
                      const last = cursors[stream];
                      if (last === undefined || last === null) {
                        return { data: null, error: null };
                      }
                      return {
                        data: {
                          stream_name: stream,
                          chain_id: 4663,
                          last_processed_block: last,
                        },
                        error: null,
                      };
                    },
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
  return { cursors, supabase };
}

describe("catchUpPoolsInstantCursor range bound", () => {
  it("a multi-million-block backlog scans only one outer range", async () => {
    const stored = 37_425_250;
    const { cursors, supabase } = cursorSupabase(stored);
    const getLogsCalls: Array<{ fromBlock: number; toBlock: number }> = [];
    const rpc = {
      async getBlockNumber() {
        return 38_876_471;
      },
      async getLogs(input: { fromBlock: number; toBlock: number }) {
        getLogsCalls.push({
          fromBlock: input.fromBlock,
          toBlock: input.toBlock,
        });
        return [];
      },
    } as unknown as ChainRpc;

    const result = await catchUpPoolsInstantCursor({
      rpc,
      supabase,
      chainId: 4663,
      startupRewind: false,
      maxOuterRangeBlocks: 10,
      maxRanges: POOLS_CATCH_UP_MAX_RANGES_PER_CYCLE,
    });

    assert.equal(result.rangesScanned, 1);
    assert.equal(result.advanced, true);
    assert.equal(result.lastProcessedBlock, stored + 10);
    assert.equal(cursors.pools_instant, stored + 10);
    assert.ok(getLogsCalls.length >= 1);
    assert.ok(getLogsCalls.length < 50);
    assert.equal(getLogsCalls[0]!.fromBlock, stored + 1);
  });

  it("missing Instant cursor stays idle and does not invent a bootstrap origin", async () => {
    const { cursors, supabase } = cursorSupabase(null);
    const result = await catchUpPoolsInstantCursor({
      rpc: {
        async getBlockNumber() {
          return 38_876_471;
        },
      } as unknown as ChainRpc,
      supabase,
      chainId: 4663,
      startupRewind: false,
      maxRanges: 1,
    });
    assert.equal(result.lastProcessedBlock, null);
    assert.equal(result.rangesScanned, 0);
    assert.equal(cursors.pools_instant, null);
  });

  it("Instant errors stay isolated and do not throw", async () => {
    const result = await catchUpPoolsInstantCursorIsolated({
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
      startupRewind: false,
      maxRanges: 1,
    });
    assert.equal(result, null);
  });
});
