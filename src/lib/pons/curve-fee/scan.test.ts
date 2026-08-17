/**
 * Closed-range PONS V2 curve-fee scanner (operator verification).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { encodeAbiParameters, pad, parseAbiParameters } from "viem";
import {
  applyPonsV2CurveFeeBatchPure,
  createPonsV2CurveFeeStore,
  loadTokenFeeMetricsFromStore,
  type PonsV2CurveFeeStore,
} from "@/lib/pons/curve-fee/apply";
import {
  PONS_V2_CURVE_BUY_TOPIC0,
  PONS_V2_CURVE_FEE_TOPIC0S,
  PONS_V2_CURVE_INITIALIZED_TOPIC0,
  PONS_V2_CURVE_SELL_TOPIC0,
  PONS_V2_SNIPE_TAX_CHARGED_TOPIC0,
  PONS_V2_SNIPE_TAX_EXEMPTED_TOPIC0,
} from "@/lib/pons/curve-fee/constants";
import { formatNativeQuoteWei18 } from "@/lib/pons/curve-fee/format";
import {
  classifyPonsV2CurveFeeLogs,
  scanPonsV2CurveFeesRange,
  validatePonsV2CurveFeeScanRange,
} from "@/lib/pons/curve-fee/scan";
import type { PonsV2CurveFeeLogLike } from "@/lib/pons/curve-fee/types";
import type { ChainRpc, RpcLog } from "@/lib/worker/chain/rpc";
import { APPLY_PONS_V2_CURVE_FEES_RPC } from "@/lib/worker/repositories/pons-v2-fees";
import type { WorkerSupabase } from "@/lib/worker/supabase";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const CHAIN = 4663;
const TOKEN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CURVE = "0xcccccccccccccccccccccccccccccccccccccccc";
const OTHER_CURVE = "0xdddddddddddddddddddddddddddddddddddddddd";
const QUOTE = "0x0000000000000000000000000000000000000000";
const BUYER = "0x1111111111111111111111111111111111111111";
const SELLER = "0x3333333333333333333333333333333333333333";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const TX_BUY =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const TX_SELL =
  "0x2222222222222222222222222222222222222222222222222222222222222222";
const TRANSFER_TOPIC0 =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function encodeCurveBuy(fee: bigint, tax: bigint) {
  return {
    topics: [
      PONS_V2_CURVE_BUY_TOPIC0,
      pad(BUYER as `0x${string}`),
      pad(RECIPIENT as `0x${string}`),
    ],
    data: encodeAbiParameters(
      parseAbiParameters("uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax"),
      [1_000_000_000_000_000_000n, 42n, fee, tax],
    ),
  };
}

function encodeCurveSell(fee: bigint, tax: bigint) {
  return {
    topics: [
      PONS_V2_CURVE_SELL_TOPIC0,
      pad(SELLER as `0x${string}`),
      pad(RECIPIENT as `0x${string}`),
    ],
    data: encodeAbiParameters(
      parseAbiParameters("uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax"),
      [42n, 900_000_000_000_000_000n, fee, tax],
    ),
  };
}

function buyLog(
  overrides: Partial<PonsV2CurveFeeLogLike> = {},
): RpcLog {
  const encoded = encodeCurveBuy(10n, 3n);
  return {
    address: CURVE,
    blockNumber: BigInt(100),
    transactionHash: TX_BUY,
    logIndex: 1,
    topics: encoded.topics,
    data: encoded.data,
    ...overrides,
  };
}

function sellLog(
  overrides: Partial<PonsV2CurveFeeLogLike> = {},
): RpcLog {
  const encoded = encodeCurveSell(7n, 1n);
  return {
    address: CURVE,
    blockNumber: BigInt(101),
    transactionHash: TX_SELL,
    logIndex: 2,
    topics: encoded.topics,
    data: encoded.data,
    ...overrides,
  };
}

/** PostgREST returns numeric(78,0) as a JSON number when it fits IEEE-754. */
function asPostgrestNumeric(value: string): string | number {
  const n = Number(value);
  if (Number.isSafeInteger(n) && n >= 0 && String(n) === value) return n;
  return value;
}

function eventToDb(row: {
  chainId: number;
  tokenAddress: string;
  curveAddress: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  side: string;
  feeRaw: string;
  taxRaw: string;
  totalFeeRaw: string;
  venue: string;
}) {
  return {
    chain_id: row.chainId,
    token_address: row.tokenAddress,
    curve_address: row.curveAddress,
    tx_hash: row.txHash,
    log_index: row.logIndex,
    block_number: row.blockNumber,
    side: row.side,
    fee_raw: asPostgrestNumeric(row.feeRaw),
    tax_raw: asPostgrestNumeric(row.taxRaw),
    total_fee_raw: asPostgrestNumeric(row.totalFeeRaw),
    venue: row.venue,
  };
}

function createFeeScanSupabase(store: PonsV2CurveFeeStore) {
  const touched = new Set<string>();
  const supabase = {
    async rpc(name: string, args: { p_events: Array<Record<string, unknown>> }) {
      assert.equal(name, APPLY_PONS_V2_CURVE_FEES_RPC);
      const events = (args.p_events ?? []).map((e) => ({
        chainId: Number(e.chain_id),
        tokenAddress: String(e.token_address),
        curveAddress: String(e.curve_address),
        txHash: String(e.tx_hash),
        logIndex: Number(e.log_index),
        blockNumber: Number(e.block_number),
        side: e.side as "buy" | "sell",
        feeRaw: String(e.fee_raw),
        taxRaw: String(e.tax_raw),
        quoteTokenAddress: String(e.quote_token_address),
      }));
      const result = applyPonsV2CurveFeeBatchPure(store, events);
      return { data: result, error: null };
    },
    from(table: string) {
      touched.add(table);
      if (
        table === "chain_cursors" ||
        table === "production_state" ||
        table === "events"
      ) {
        throw new Error(`scanner must not touch ${table}`);
      }
      if (table === "token_fee_metrics") {
        const filters: Record<string, unknown> = {};
        const q = {
          select() {
            return q;
          },
          eq(col: string, value: unknown) {
            filters[col] = value;
            return q;
          },
          maybeSingle() {
            const row = loadTokenFeeMetricsFromStore(
              store,
              Number(filters.chain_id),
              String(filters.token_address),
            );
            if (!row) return Promise.resolve({ data: null, error: null });
            return Promise.resolve({
              data: {
                chain_id: row.chainId,
                token_address: row.tokenAddress,
                launchpad: row.launchpad,
                factory_version: row.factoryVersion,
                quote_token_address: row.quoteTokenAddress,
                global_fees_paid_quote: asPostgrestNumeric(
                  row.globalFeesPaidQuote,
                ),
                buy_fees_quote: asPostgrestNumeric(row.buyFeesQuote),
                sell_fees_quote: asPostgrestNumeric(row.sellFeesQuote),
                buy_count: row.buyCount,
                sell_count: row.sellCount,
                last_fee_block: row.lastFeeBlock,
              },
              error: null,
            });
          },
        };
        return q;
      }
      if (table === "pons_v2_curve_fee_events") {
        const filters: Record<string, unknown> = {};
        const q = {
          select() {
            return q;
          },
          eq(col: string, value: unknown) {
            filters[col] = value;
            return q;
          },
          gte(col: string, value: unknown) {
            filters[`${col}_gte`] = value;
            return q;
          },
          lte(col: string, value: unknown) {
            filters[`${col}_lte`] = value;
            return q;
          },
          order() {
            return q;
          },
          range(from: number, to: number) {
            const chainId = Number(filters.chain_id);
            const token = String(filters.token_address);
            const fromBlock = Number(filters.block_number_gte);
            const toBlock = Number(filters.block_number_lte);
            const rows = [...store.events.values()]
              .filter(
                (e) =>
                  e.chainId === chainId &&
                  e.tokenAddress === token &&
                  e.blockNumber >= fromBlock &&
                  e.blockNumber <= toBlock,
              )
              .sort((a, b) =>
                a.blockNumber !== b.blockNumber
                  ? a.blockNumber - b.blockNumber
                  : a.logIndex - b.logIndex,
              )
              .slice(from, to + 1)
              .map(eventToDb);
            return Promise.resolve({ data: rows, error: null });
          },
        };
        return q;
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as WorkerSupabase;
  return { supabase, touched };
}

function createRpc(logs: RpcLog[]) {
  const getLogsCalls: Array<Record<string, unknown>> = [];
  const rpc = {
    async getLogs(input: Record<string, unknown>) {
      getLogsCalls.push({ ...input });
      return logs;
    },
  } as unknown as ChainRpc;
  return { rpc, getLogsCalls };
}

describe("validatePonsV2CurveFeeScanRange", () => {
  it("rejects invalid ranges", () => {
    assert.throws(() => validatePonsV2CurveFeeScanRange(20, 10));
    assert.throws(() => validatePonsV2CurveFeeScanRange(-1, 10));
    assert.throws(() => validatePonsV2CurveFeeScanRange(1.5, 10));
    assert.throws(() => validatePonsV2CurveFeeScanRange(Number.NaN, 10));
    validatePonsV2CurveFeeScanRange(10, 10);
    validatePonsV2CurveFeeScanRange(0, 1);
  });
});

describe("classifyPonsV2CurveFeeLogs", () => {
  it("decodes buy + sell and sums fee/tax exactly", () => {
    const classified = classifyPonsV2CurveFeeLogs(
      [buyLog(), sellLog()],
      CURVE,
      100,
      101,
    );
    assert.equal(classified.decodedBuys, 1);
    assert.equal(classified.decodedSells, 1);
    assert.equal(classified.malformed, 0);
    assert.equal(classified.totalFee, 17n);
    assert.equal(classified.totalTax, 4n);
    assert.equal(classified.totalPaid, 21n);
  });

  it("counts malformed / wrong-curve / bad-topic logs without applying them", () => {
    const classified = classifyPonsV2CurveFeeLogs(
      [
        buyLog(),
        buyLog({ data: "0xdead" }),
        buyLog({ address: OTHER_CURVE, transactionHash: TX_SELL }),
        buyLog({
          topics: [TRANSFER_TOPIC0, ...(buyLog().topics.slice(1) as string[])],
          logIndex: 9,
        }),
      ],
      CURVE,
      100,
      101,
    );
    assert.equal(classified.decodedBuys, 1);
    assert.equal(classified.decodedSells, 0);
    assert.equal(classified.malformed, 3);
    assert.equal(classified.totalPaid, 13n);
  });

  it("labels live companion BondingCurve events as wrong_topic0, not fees", () => {
    // Live specimen range 33486660-33487660 returned 4 curve logs because
    // viem getLogs ignored topics. Decoder correctly refused the 3 non-trade
    // events. Shapes from the node:
    //   Initialized          topicCount=1 dataBytes=32
    //   SnipeTaxExempted     topicCount=2 dataBytes=0
    //   SnipeTaxCharged      topicCount=2 dataBytes=32
    const classified = classifyPonsV2CurveFeeLogs(
      [
        {
          address: CURVE,
          blockNumber: 33_486_660n,
          transactionHash: TX_BUY,
          logIndex: 0,
          topics: [PONS_V2_CURVE_INITIALIZED_TOPIC0],
          data: `0x${"00".repeat(32)}`,
        },
        {
          address: CURVE,
          blockNumber: 33_486_660n,
          transactionHash: TX_BUY,
          logIndex: 1,
          topics: [
            PONS_V2_SNIPE_TAX_EXEMPTED_TOPIC0,
            pad(BUYER as `0x${string}`),
          ],
          data: "0x",
        },
        {
          address: CURVE,
          blockNumber: 33_486_660n,
          transactionHash: TX_BUY,
          logIndex: 2,
          topics: [
            PONS_V2_SNIPE_TAX_CHARGED_TOPIC0,
            pad(BUYER as `0x${string}`),
          ],
          data: `0x${"00".repeat(32)}`,
        },
        buyLog({ logIndex: 3, blockNumber: 33_486_660n }),
      ],
      CURVE,
      33_486_660,
      33_487_660,
    );
    assert.equal(classified.decodedBuys, 1);
    assert.equal(classified.decodedSells, 0);
    assert.equal(classified.malformed, 3);
    assert.deepEqual(
      classified.malformedLogs.map((m) => ({
        knownEvent: m.knownEvent,
        reason: m.reason,
        topicCount: m.topicCount,
        dataBytes: m.dataBytes,
        topic0: m.topic0,
      })),
      [
        {
          knownEvent: "Initialized",
          reason: "wrong_topic0",
          topicCount: 1,
          dataBytes: 32,
          topic0: PONS_V2_CURVE_INITIALIZED_TOPIC0,
        },
        {
          knownEvent: "SnipeTaxExempted",
          reason: "wrong_topic0",
          topicCount: 2,
          dataBytes: 0,
          topic0: PONS_V2_SNIPE_TAX_EXEMPTED_TOPIC0,
        },
        {
          knownEvent: "SnipeTaxCharged",
          reason: "wrong_topic0",
          topicCount: 2,
          dataBytes: 32,
          topic0: PONS_V2_SNIPE_TAX_CHARGED_TOPIC0,
        },
      ],
    );
    assert.equal(classified.totalFee, 10n);
    assert.equal(classified.totalTax, 3n);
  });
});

describe("scanPonsV2CurveFeesRange", () => {
  it("fetches with topic0 OR, applies once, then duplicate replay skips", async () => {
    const logs = [buyLog(), sellLog()];
    const { rpc, getLogsCalls } = createRpc(logs);
    const store = createPonsV2CurveFeeStore();
    const { supabase, touched } = createFeeScanSupabase(store);

    const first = await scanPonsV2CurveFeesRange({
      rpc,
      supabase,
      chainId: CHAIN,
      tokenAddress: TOKEN,
      curveAddress: CURVE,
      quoteTokenAddress: QUOTE,
      fromBlock: 100,
      toBlock: 101,
    });

    assert.deepEqual(getLogsCalls[0]!.topic0, [...PONS_V2_CURVE_FEE_TOPIC0S]);
    assert.equal(getLogsCalls[0]!.address, CURVE);
    assert.equal(first.rawLogs, 2);
    assert.equal(first.decodedBuys, 1);
    assert.equal(first.decodedSells, 1);
    assert.equal(first.malformed, 0);
    assert.equal(first.totalFeeRaw, "17");
    assert.equal(first.totalTaxRaw, "4");
    assert.equal(first.totalPaidRaw, "21");
    assert.equal(first.inserted, 2);
    assert.equal(first.skippedDuplicates, 0);
    assert.equal(first.applyStatus, "ok");
    assert.deepEqual(first.failures, []);
    assert.equal(first.rangeMatch, true);
    assert.equal(first.rangeLocalPaidRaw, "21");
    assert.equal(first.lifetimePaidRaw, "21");
    assert.equal(first.metricsAfter?.buyCount, 1);
    assert.equal(first.metricsAfter?.sellCount, 1);
    assert.equal(first.metricsAfter?.lastFeeBlock, 101);
    assert.equal(first.metricsAfter?.quoteTokenAddress, QUOTE);
    assert.equal(touched.has("chain_cursors"), false);
    assert.equal(touched.has("production_state"), false);

    const second = await scanPonsV2CurveFeesRange({
      rpc,
      supabase,
      chainId: CHAIN,
      tokenAddress: TOKEN,
      curveAddress: CURVE,
      quoteTokenAddress: QUOTE,
      fromBlock: 100,
      toBlock: 101,
    });
    assert.equal(second.inserted, 0);
    assert.equal(second.skippedDuplicates, 2);
    assert.equal(second.applyStatus, "ok");
    assert.deepEqual(second.failures, []);
    assert.equal(second.decodedBuys + second.decodedSells, 2);
    assert.equal(second.lifetimePaidRaw, "21");
    assert.equal(second.rangeMatch, true);
    const metrics = loadTokenFeeMetricsFromStore(store, CHAIN, TOKEN);
    assert.equal(metrics?.globalFeesPaidQuote, "21");
    assert.equal(metrics?.buyCount, 1);
    assert.equal(metrics?.sellCount, 1);
  });

  it("does not treat lifetime extras outside the range as a range mismatch", async () => {
    const store = createPonsV2CurveFeeStore();
    applyPonsV2CurveFeeBatchPure(store, [
      {
        chainId: CHAIN,
        tokenAddress: TOKEN,
        curveAddress: CURVE,
        txHash: "0x9999999999999999999999999999999999999999999999999999999999999999",
        logIndex: 0,
        blockNumber: 50,
        side: "buy",
        feeRaw: 100n,
        taxRaw: 0n,
        quoteTokenAddress: QUOTE,
      },
    ]);
    const { rpc } = createRpc([buyLog()]);
    const { supabase } = createFeeScanSupabase(store);
    const result = await scanPonsV2CurveFeesRange({
      rpc,
      supabase,
      chainId: CHAIN,
      tokenAddress: TOKEN,
      curveAddress: CURVE,
      quoteTokenAddress: QUOTE,
      fromBlock: 100,
      toBlock: 101,
    });
    assert.equal(result.totalPaidRaw, "13");
    assert.equal(result.rangeLocalPaidRaw, "13");
    assert.equal(result.lifetimePaidRaw, "113");
    assert.equal(result.rangeMatch, true);
    assert.notEqual(result.lifetimePaidRaw, result.totalPaidRaw);
  });

  it("refuses invalid ranges before any RPC/DB work", async () => {
    let called = false;
    const rpc = {
      async getLogs() {
        called = true;
        return [];
      },
    } as unknown as ChainRpc;
    const supabase = {
      rpc() {
        called = true;
        return Promise.resolve({ data: null, error: null });
      },
      from() {
        called = true;
        throw new Error("no db");
      },
    } as unknown as WorkerSupabase;
    await assert.rejects(
      () =>
        scanPonsV2CurveFeesRange({
          rpc,
          supabase,
          chainId: CHAIN,
          tokenAddress: TOKEN,
          curveAddress: CURVE,
          quoteTokenAddress: QUOTE,
          fromBlock: 200,
          toBlock: 100,
        }),
      /invalid closed range/,
    );
    assert.equal(called, false);
  });

  it("does not report inserted when apply RPC fails", async () => {
    const { rpc } = createRpc([buyLog()]);
    const supabase = {
      async rpc() {
        return {
          data: null,
          error: { message: "fee_raw and tax_raw must be decimal strings" },
        };
      },
      from() {
        const q = {
          select() {
            return q;
          },
          eq() {
            return q;
          },
          gte() {
            return q;
          },
          lte() {
            return q;
          },
          order() {
            return q;
          },
          maybeSingle() {
            return Promise.resolve({ data: null, error: null });
          },
          range() {
            return Promise.resolve({ data: [], error: null });
          },
        };
        return q;
      },
    } as unknown as WorkerSupabase;

    const result = await scanPonsV2CurveFeesRange({
      rpc,
      supabase,
      chainId: CHAIN,
      tokenAddress: TOKEN,
      curveAddress: CURVE,
      quoteTokenAddress: QUOTE,
      fromBlock: 100,
      toBlock: 101,
    });
    assert.equal(result.applyStatus, "failed");
    assert.equal(result.inserted, 0);
    assert.equal(result.skippedDuplicates, 0);
    assert.equal(result.rangeMatch, false);
    assert.equal(result.decodedBuys, 1);
    assert.ok(result.failures[0]?.startsWith("apply_failed:"));
  });

  it("keeps apply inserted when verify load fails after a successful RPC", async () => {
    const { rpc } = createRpc([buyLog()]);
    const supabase = {
      async rpc() {
        return {
          data: { status: "ok", applied: 1, skipped: 0 },
          error: null,
        };
      },
      from() {
        throw new Error(
          "[pons-v2-fees] numeric value must be a decimal string, not number",
        );
      },
    } as unknown as WorkerSupabase;

    const result = await scanPonsV2CurveFeesRange({
      rpc,
      supabase,
      chainId: CHAIN,
      tokenAddress: TOKEN,
      curveAddress: CURVE,
      quoteTokenAddress: QUOTE,
      fromBlock: 100,
      toBlock: 101,
    });
    assert.equal(result.applyStatus, "ok");
    assert.equal(result.inserted, 1);
    assert.equal(result.rangeMatch, false);
    assert.ok(
      result.failures[0]?.startsWith("verify_failed:"),
      result.failures.join(" | "),
    );
    assert.equal(result.metricsAfter, null);
  });
});

describe("native ETH display formatting", () => {
  it("formats 18-decimal ETH without floats", () => {
    assert.equal(formatNativeQuoteWei18(0n), "0");
    assert.equal(formatNativeQuoteWei18(1n), "0.000000000000000001");
    assert.equal(formatNativeQuoteWei18(1_000_000_000_000_000_000n), "1");
    assert.equal(formatNativeQuoteWei18(1_500_000_000_000_000_000n), "1.5");
  });
});

describe("Phase 2 isolation", () => {
  it("does not import continuation/RADAR or write cursors", () => {
    const scan = readSrc("src/lib/pons/curve-fee/scan.ts");
    const script = readSrc("scripts/verify-pons-v2-fees.ts");
    const worker = readSrc("scripts/worker.ts");
    for (const src of [scan, script]) {
      assert.equal(src.includes("@/lib/pons/continuation"), false);
      assert.equal(src.includes("@/lib/events/radar"), false);
      assert.equal(src.includes("@/lib/events/continuation-watchlist"), false);
      assert.equal(src.includes("upsertCursor"), false);
      assert.equal(src.includes('from("chain_cursors")'), false);
      assert.equal(src.includes("fire_pons_"), false);
      assert.equal(src.includes("loadProductionState"), false);
    }
    assert.equal(worker.includes("scanPonsV2CurveFeesRange"), false);
    assert.equal(worker.includes("verify-pons-v2-fees"), false);
    assert.ok(worker.includes("catchUpPonsV2CurveFeesCursorIsolated"));
  });
});
