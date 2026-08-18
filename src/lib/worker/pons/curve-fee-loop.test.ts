/**
 * Isolated PONS V2 fee catch-up: factory barrier, one range, no implicit origin.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeAbiParameters, pad, parseAbiParameters } from "viem";
import {
  PONS_V2_CURVE_BUY_TOPIC0,
  PONS_V2_CURVE_FEE_TOPIC0S,
} from "@/lib/pons/curve-fee/constants";
import {
  addPonsV2LaunchToFeeIndex,
  createPonsV2FeeCurveIndex,
} from "@/lib/pons/curve-fee/curve-map";
import type { ChainRpc, RpcLog } from "@/lib/worker/chain/rpc";
import { PONS_V2_FEE_CATCH_UP_MAX_RANGES_PER_CYCLE } from "@/lib/worker/constants";
import {
  catchUpPonsV2CurveFeesCursor,
  catchUpPonsV2CurveFeesCursorIsolated,
} from "@/lib/worker/pons/curve-fee-loop";
import type { PonsFactoryDefinition } from "@/lib/pons/factories";
import { APPLY_PONS_V2_CURVE_FEES_RPC } from "@/lib/worker/repositories/pons-v2-fees";
import type { WorkerSupabase } from "@/lib/worker/supabase";

const CHAIN = 4663;
const CURVE = "0xcccccccccccccccccccccccccccccccccccccccc";
const TOKEN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const QUOTE = "0x3333333333333333333333333333333333333333";
const BUYER = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const TX =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const UNKNOWN_CURVE = "0xdddddddddddddddddddddddddddddddddddddddd";

const FACTORIES: PonsFactoryDefinition[] = [
  { version: "v2", address: "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e" },
];

function encodeCurveBuy(fee: bigint, tax: bigint) {
  return {
    topics: [
      PONS_V2_CURVE_BUY_TOPIC0,
      pad(BUYER as `0x${string}`),
      pad(RECIPIENT as `0x${string}`),
    ],
    data: encodeAbiParameters(
      parseAbiParameters("uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax"),
      [BigInt("1000000000000000000"), BigInt(42), fee, tax],
    ),
  };
}

function buyLog(address = CURVE, block = 101): RpcLog {
  const encoded = encodeCurveBuy(BigInt(10), BigInt(3));
  return {
    address,
    blockNumber: BigInt(block),
    transactionHash: TX,
    logIndex: 3,
    topics: encoded.topics,
    data: encoded.data,
  };
}

function cursorRow(stream: string, last: number | null) {
  if (last === null) return { data: null, error: null };
  return {
    data: {
      stream_name: stream,
      chain_id: CHAIN,
      last_processed_block: last,
    },
    error: null,
  };
}

function feeIndexWithQuote() {
  const index = createPonsV2FeeCurveIndex();
  addPonsV2LaunchToFeeIndex(index, {
    factoryVersion: "v2",
    tokenAddress: TOKEN,
    marketAddress: CURVE,
    launchBlockNumber: 50,
  });
  const entry = index.byCurve.get(CURVE)!;
  entry.quoteTokenAddress = QUOTE;
  return index;
}

function createFeeSupabase(input: {
  factory: number | null;
  fees: number | null;
  rpcError?: string;
  ledger?: Set<string>;
}) {
  const cursors: Record<string, number | null> = {
    pons_factories: input.factory,
    pons_v2_curve_fees: input.fees,
  };
  const upserts: Array<Record<string, unknown>> = [];
  const rpcCalls: unknown[] = [];
  const ledger = input.ledger ?? new Set<string>();
  const supabase = {
    async rpc(name: string, args: { p_events: Array<Record<string, unknown>> }) {
      rpcCalls.push(args);
      assert.equal(name, APPLY_PONS_V2_CURVE_FEES_RPC);
      if (input.rpcError) {
        return { data: null, error: { message: input.rpcError } };
      }
      let applied = 0;
      let skipped = 0;
      for (const event of args.p_events ?? []) {
        const key = `${String(event.tx_hash)}:${String(event.log_index)}`;
        if (ledger.has(key)) skipped += 1;
        else {
          ledger.add(key);
          applied += 1;
        }
      }
      return { data: { status: "ok", applied, skipped }, error: null };
    },
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
                    maybeSingle: async () => cursorRow(stream, cursors[stream] ?? null),
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
          upserts.push(payload);
          return {
            select() {
              return {
                single: async () => ({
                  data: {
                    stream_name: payload.stream_name,
                    chain_id: CHAIN,
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
  return { supabase, cursors, upserts, rpcCalls, ledger };
}

describe("catchUpPonsV2CurveFeesCursor", () => {
  it("missing cursor stays idle and does not invent a bootstrap origin", async () => {
    const { supabase, cursors } = createFeeSupabase({
      factory: 100,
      fees: null,
    });
    const result = await catchUpPonsV2CurveFeesCursor({
      rpc: {
        async getBlockNumber() {
          return 200;
        },
      } as unknown as ChainRpc,
      supabase,
      chainId: CHAIN,
      factories: FACTORIES,
      index: createPonsV2FeeCurveIndex(),
      startupRewind: false,
      maxRanges: 1,
    });
    assert.equal(result.lastProcessedBlock, null);
    assert.equal(result.rangesScanned, 0);
    assert.equal(result.advanced, false);
    assert.equal(result.idle, true);
    assert.equal(result.caughtUp, false);
    assert.equal(cursors.pons_v2_curve_fees, null);
  });

  it("a large backlog scans only the requested bounded ranges", async () => {
    const stored = 10;
    const { supabase, cursors } = createFeeSupabase({
      factory: 10_000,
      fees: stored,
    });
    const getLogsCalls: Array<Record<string, unknown>> = [];
    const result = await catchUpPonsV2CurveFeesCursor({
      rpc: {
        async getBlockNumber() {
          return 10_000;
        },
        async getLogs(input: Record<string, unknown>) {
          getLogsCalls.push({ ...input });
          return [];
        },
      } as unknown as ChainRpc,
      supabase,
      chainId: CHAIN,
      factories: FACTORIES,
      index: feeIndexWithQuote(),
      startupRewind: false,
      maxOuterRangeBlocks: 10,
      maxRanges: 1,
    });
    assert.equal(result.rangesScanned, 1);
    assert.equal(result.advanced, true);
    assert.equal(result.idle, false);
    assert.equal(result.lastProcessedBlock, stored + 10);
    assert.equal(cursors.pons_v2_curve_fees, stored + 10);
    assert.equal(getLogsCalls[0]!.address, undefined);
    assert.deepEqual(getLogsCalls[0]!.topic0, [...PONS_V2_CURVE_FEE_TOPIC0S]);
  });

  it("does not advance when pons_factories cursor is missing", async () => {
    const { supabase, upserts } = createFeeSupabase({
      factory: null,
      fees: 10,
    });
    const result = await catchUpPonsV2CurveFeesCursor({
      rpc: {
        async getBlockNumber() {
          return 20;
        },
      } as unknown as ChainRpc,
      supabase,
      chainId: CHAIN,
      factories: FACTORIES,
      index: feeIndexWithQuote(),
      startupRewind: false,
    });
    assert.equal(result.blocked, true);
    assert.deepEqual(result.failures, ["pons_factories cursor missing"]);
    assert.equal(result.advanced, false);
    assert.equal(
      upserts.some((u) => u.stream_name === "pons_v2_curve_fees"),
      false,
    );
  });

  it("does not advance the fee cursor when factory discovery is behind", async () => {
    const { supabase, cursors, upserts } = createFeeSupabase({
      factory: 50,
      fees: 3_999_000,
    });
    const result = await catchUpPonsV2CurveFeesCursor({
      rpc: {
        async getBlockNumber() {
          return 4_000_000;
        },
        async getLogs() {
          return [];
        },
      } as unknown as ChainRpc,
      supabase,
      chainId: CHAIN,
      factories: FACTORIES,
      index: feeIndexWithQuote(),
      startupRewind: false,
      maxOuterRangeBlocks: 10,
      maxRanges: 1,
    });
    assert.equal(result.advanced, false);
    assert.equal(result.blocked, true);
    assert.ok(result.failures.some((f) => f.includes("pons_factories lag")));
    assert.equal(cursors.pons_v2_curve_fees, 3_999_000);
    assert.equal(
      upserts.some((u) => u.stream_name === "pons_v2_curve_fees"),
      false,
    );
    assert.equal(cursors.pons_factories, 60);
  });

  it("failed apply does not advance the fee cursor", async () => {
    const { supabase, cursors, upserts } = createFeeSupabase({
      factory: 200,
      fees: 100,
      rpcError: "fee_raw and tax_raw must be decimal strings",
    });
    const result = await catchUpPonsV2CurveFeesCursor({
      rpc: {
        async getBlockNumber() {
          return 200;
        },
        async getLogs() {
          return [buyLog()];
        },
      } as unknown as ChainRpc,
      supabase,
      chainId: CHAIN,
      factories: FACTORIES,
      index: feeIndexWithQuote(),
      startupRewind: false,
      maxOuterRangeBlocks: 50,
      maxRanges: 1,
    });
    assert.equal(result.advanced, false);
    assert.equal(result.inserted, 0);
    assert.equal(cursors.pons_v2_curve_fees, 100);
    assert.equal(
      upserts.some((u) => u.stream_name === "pons_v2_curve_fees"),
      false,
    );
    assert.ok(result.failures[0]?.startsWith("apply_failed:"));
  });

  it("successful range applies once then duplicate replay is idempotent", async () => {
    const { supabase, cursors, rpcCalls, ledger } = createFeeSupabase({
      factory: 200,
      fees: 100,
    });
    const rpc = {
      async getBlockNumber() {
        return 200;
      },
      async getLogs(input: { fromBlock: number; toBlock: number }) {
        if (input.fromBlock <= 101 && input.toBlock >= 101) {
          return [buyLog()];
        }
        return [];
      },
    } as unknown as ChainRpc;

    const first = await catchUpPonsV2CurveFeesCursor({
      rpc,
      supabase,
      chainId: CHAIN,
      factories: FACTORIES,
      index: feeIndexWithQuote(),
      startupRewind: false,
      maxOuterRangeBlocks: 50,
      maxRanges: 1,
    });
    assert.equal(first.inserted, 1);
    assert.equal(first.skippedDuplicates, 0);
    assert.equal(first.advanced, true);
    assert.equal(cursors.pons_v2_curve_fees, 150);
    const payload = (rpcCalls[0] as { p_events: Array<Record<string, unknown>> })
      .p_events[0]!;
    assert.equal(payload.quote_token_address, QUOTE);
    assert.equal(payload.fee_raw, "10");
    assert.equal(typeof payload.fee_raw, "string");

    cursors.pons_v2_curve_fees = 100;
    const second = await catchUpPonsV2CurveFeesCursor({
      rpc,
      supabase,
      chainId: CHAIN,
      factories: FACTORIES,
      index: feeIndexWithQuote(),
      startupRewind: false,
      maxOuterRangeBlocks: 50,
      maxRanges: 1,
    });
    assert.equal(second.inserted, 0);
    assert.equal(second.skippedDuplicates, 1);
    assert.equal(second.advanced, true);
    assert.equal(ledger.size, 1);
  });

  it("unknown curves are counted and do not corrupt another token", async () => {
    const { supabase, rpcCalls } = createFeeSupabase({
      factory: 200,
      fees: 100,
    });
    const result = await catchUpPonsV2CurveFeesCursor({
      rpc: {
        async getBlockNumber() {
          return 200;
        },
        async getLogs() {
          return [buyLog(UNKNOWN_CURVE)];
        },
      } as unknown as ChainRpc,
      supabase,
      chainId: CHAIN,
      factories: FACTORIES,
      index: feeIndexWithQuote(),
      startupRewind: false,
      maxOuterRangeBlocks: 50,
      maxRanges: 1,
    });
    assert.equal(result.unknownCurves, 1);
    assert.equal(result.inserted, 0);
    assert.equal(result.advanced, true);
    assert.equal(rpcCalls.length, 0);
  });

  it("quote RPC failure does not apply guessed ETH and does not advance", async () => {
    const index = createPonsV2FeeCurveIndex();
    addPonsV2LaunchToFeeIndex(index, {
      factoryVersion: "v2",
      tokenAddress: TOKEN,
      marketAddress: CURVE,
      launchBlockNumber: 50,
    });
    const { supabase, cursors } = createFeeSupabase({
      factory: 200,
      fees: 100,
    });
    const result = await catchUpPonsV2CurveFeesCursor({
      rpc: {
        async getBlockNumber() {
          return 200;
        },
        async getLogs() {
          return [buyLog()];
        },
        async call() {
          throw new Error("pairToken revert");
        },
      } as unknown as ChainRpc,
      supabase,
      chainId: CHAIN,
      factories: FACTORIES,
      index,
      startupRewind: false,
      maxOuterRangeBlocks: 50,
      maxRanges: 1,
    });
    assert.equal(result.advanced, false);
    assert.equal(result.inserted, 0);
    assert.equal(cursors.pons_v2_curve_fees, 100);
    assert.ok(result.failures[0]?.includes("quote_unresolved"));
    assert.equal(index.byCurve.get(CURVE)?.quoteTokenAddress, null);
  });

  it("fee errors stay isolated and do not throw", async () => {
    const result = await catchUpPonsV2CurveFeesCursorIsolated({
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
      chainId: CHAIN,
      factories: FACTORIES,
      index: createPonsV2FeeCurveIndex(),
      startupRewind: false,
      maxRanges: 1,
    });
    assert.equal(result, null);
  });

  it("default catch-up stays bounded to PONS_V2_FEE_CATCH_UP_MAX_RANGES_PER_CYCLE", async () => {
    const stored = 10;
    const { supabase, cursors } = createFeeSupabase({
      factory: 10_000,
      fees: stored,
    });
    const result = await catchUpPonsV2CurveFeesCursor({
      rpc: {
        async getBlockNumber() {
          return 10_000;
        },
        async getLogs() {
          return [];
        },
      } as unknown as ChainRpc,
      supabase,
      chainId: CHAIN,
      factories: FACTORIES,
      index: feeIndexWithQuote(),
      startupRewind: false,
      maxOuterRangeBlocks: 10,
    });
    assert.equal(result.rangesScanned, PONS_V2_FEE_CATCH_UP_MAX_RANGES_PER_CYCLE);
    assert.equal(
      cursors.pons_v2_curve_fees,
      stored + 10 * PONS_V2_FEE_CATCH_UP_MAX_RANGES_PER_CYCLE,
    );
    assert.equal(result.caughtUp, false);
    assert.ok((result.lag ?? 0) > 0);
  });

  it("maxBlocks stops catch-up even when maxRanges would allow more", async () => {
    const stored = 10;
    const { supabase, cursors } = createFeeSupabase({
      factory: 10_000,
      fees: stored,
    });
    const result = await catchUpPonsV2CurveFeesCursor({
      rpc: {
        async getBlockNumber() {
          return 10_000;
        },
        async getLogs() {
          return [];
        },
      } as unknown as ChainRpc,
      supabase,
      chainId: CHAIN,
      factories: FACTORIES,
      index: feeIndexWithQuote(),
      startupRewind: false,
      maxOuterRangeBlocks: 10,
      maxRanges: 100,
      maxBlocks: 25,
    });
    assert.equal(result.rangesScanned, 3);
    assert.equal(result.blocksScanned, 30);
    assert.equal(cursors.pons_v2_curve_fees, 40);
  });

  it("getLogs failure does not advance the fee cursor", async () => {
    const { supabase, cursors, upserts } = createFeeSupabase({
      factory: 200,
      fees: 100,
    });
    const result = await catchUpPonsV2CurveFeesCursor({
      rpc: {
        async getBlockNumber() {
          return 200;
        },
        async getLogs() {
          throw new Error("eth_getLogs timeout");
        },
      } as unknown as ChainRpc,
      supabase,
      chainId: CHAIN,
      factories: FACTORIES,
      index: feeIndexWithQuote(),
      startupRewind: false,
      maxOuterRangeBlocks: 50,
      maxRanges: 1,
    });
    assert.equal(result.advanced, false);
    assert.equal(result.blocked, true);
    assert.equal(cursors.pons_v2_curve_fees, 100);
    assert.equal(
      upserts.some((u) => u.stream_name === "pons_v2_curve_fees"),
      false,
    );
    assert.ok(result.failures[0]?.startsWith("scan_failed:"));
  });
});
