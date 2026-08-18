/**
 * PONS V2 fee repository: RPC payload + numeric mapping.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPonsV2CurveFeeBatchPure,
  createPonsV2CurveFeeStore,
  loadTokenFeeMetricsFromStore,
} from "@/lib/pons/curve-fee/apply";
import { mapDbNumericToDecimalString } from "@/lib/pons/curve-fee/numeric";
import type { PonsV2CurveFeeApplyInput } from "@/lib/pons/curve-fee/types";
import type { WorkerSupabase } from "@/lib/worker/supabase";
import {
  APPLY_PONS_V2_CURVE_FEES_RPC,
  applyPonsV2CurveFeeBatch,
  CURVE_FEE_EVENT_COLUMNS,
  loadPonsV2CurveFeeEvent,
  loadTokenFeeMetrics,
  mapCurveFeeEventRow,
  mapTokenFeeMetricsRow,
  toApplyPonsV2CurveFeesPayload,
  TOKEN_FEE_METRICS_SELECT,
} from "@/lib/worker/repositories/pons-v2-fees";

const TOKEN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CURVE = "0xcccccccccccccccccccccccccccccccccccccccc";
const QUOTE = "0x0000000000000000000000000000000000000000";
const TX =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const HUGE = "9007199254740993000001";

function input(
  overrides: Partial<PonsV2CurveFeeApplyInput> = {},
): PonsV2CurveFeeApplyInput {
  return {
    chainId: 4663,
    tokenAddress: TOKEN,
    curveAddress: CURVE,
    txHash: TX,
    logIndex: 3,
    blockNumber: 42,
    side: "buy",
    feeRaw: BigInt(HUGE),
    taxRaw: BigInt(7),
    quoteTokenAddress: QUOTE,
    ...overrides,
  };
}

describe("pons-v2-fees repository", () => {
  it("sends fee_raw/tax_raw as decimal strings, never JSON numbers", () => {
    const payload = toApplyPonsV2CurveFeesPayload(input());
    assert.equal(typeof payload.fee_raw, "string");
    assert.equal(typeof payload.tax_raw, "string");
    assert.equal(payload.fee_raw, HUGE);
    assert.equal(payload.tax_raw, "7");
    assert.equal(payload.side, "buy");
    assert.equal(payload.token_address, TOKEN);
    assert.equal(payload.quote_token_address, QUOTE);
  });

  it("production RPC payload: fee/tax stay JSON strings; chain/block/log stay numbers", () => {
    // Live specimen 0x1635… / 0x3162… range 33486660-33487660
    const payload = toApplyPonsV2CurveFeesPayload(
      input({
        chainId: 4663,
        logIndex: 12,
        blockNumber: 33_486_660,
        feeRaw: BigInt(4_921_433_352_000_000),
        taxRaw: BigInt(685_436_400_000_000),
      }),
    );
    assert.equal(typeof payload.chain_id, "number");
    assert.equal(typeof payload.block_number, "number");
    assert.equal(typeof payload.log_index, "number");
    assert.equal(typeof payload.fee_raw, "string");
    assert.equal(typeof payload.tax_raw, "string");

    const jsonText = JSON.stringify({ p_events: [payload] });
    assert.ok(jsonText.includes('"fee_raw":"4921433352000000"'));
    assert.ok(jsonText.includes('"tax_raw":"685436400000000"'));
    assert.ok(jsonText.includes('"chain_id":4663'));
    assert.ok(jsonText.includes('"block_number":33486660'));
    assert.ok(jsonText.includes('"log_index":12'));
    assert.equal(jsonText.includes('"fee_raw":4921433352000000'), false);
    assert.equal(jsonText.includes('"tax_raw":685436400000000'), false);

    const roundTrip = JSON.parse(jsonText) as {
      p_events: Array<Record<string, unknown>>;
    };
    const event = roundTrip.p_events[0]!;
    assert.equal(typeof event.fee_raw, "string");
    assert.equal(typeof event.tax_raw, "string");
    assert.equal(typeof event.chain_id, "number");
    assert.equal(typeof event.block_number, "number");
    assert.equal(typeof event.log_index, "number");
    assert.equal(event.fee_raw, "4921433352000000");
    assert.equal(event.tax_raw, "685436400000000");
  });

  it("applyPonsV2CurveFeeBatch calls the atomic RPC with the batch", async () => {
    let rpcName = "";
    let rpcArgs: unknown;
    const supabase = {
      rpc(name: string, args: unknown) {
        rpcName = name;
        rpcArgs = args;
        return Promise.resolve({
          data: { status: "ok", applied: 1, skipped: 0 },
          error: null,
        });
      },
    } as unknown as WorkerSupabase;

    const result = await applyPonsV2CurveFeeBatch(supabase, [input()]);
    assert.equal(rpcName, APPLY_PONS_V2_CURVE_FEES_RPC);
    assert.deepEqual(result, { status: "ok", applied: 1, skipped: 0 });
    const args = rpcArgs as { p_events: unknown[] };
    assert.equal(args.p_events.length, 1);
    assert.equal(
      (args.p_events[0] as { fee_raw: string }).fee_raw,
      HUGE,
    );
  });

  it("repository sends production-shaped payload (string fees, number metadata) to supabase.rpc", async () => {
    let rpcArgs: unknown;
    const supabase = {
      rpc(_name: string, args: unknown) {
        rpcArgs = args;
        return Promise.resolve({
          data: { status: "ok", applied: 1, skipped: 0 },
          error: null,
        });
      },
    } as unknown as WorkerSupabase;

    await applyPonsV2CurveFeeBatch(supabase, [
      input({
        chainId: 4663,
        logIndex: 12,
        blockNumber: 33_486_660,
        feeRaw: BigInt(4_921_433_352_000_000),
        taxRaw: BigInt(685_436_400_000_000),
      }),
    ]);
    const event = (
      rpcArgs as { p_events: Array<Record<string, unknown>> }
    ).p_events[0]!;
    assert.equal(typeof event.fee_raw, "string");
    assert.equal(typeof event.tax_raw, "string");
    assert.equal(typeof event.chain_id, "number");
    assert.equal(typeof event.block_number, "number");
    assert.equal(typeof event.log_index, "number");
    assert.equal(event.fee_raw, "4921433352000000");
    assert.equal(event.tax_raw, "685436400000000");
  });

  it("throws when apply RPC returns an error (caller must not treat as inserted)", async () => {
    const supabase = {
      rpc() {
        return Promise.resolve({
          data: null,
          error: { message: "fee_raw and tax_raw must be decimal strings" },
        });
      },
    } as unknown as WorkerSupabase;
    await assert.rejects(
      () => applyPonsV2CurveFeeBatch(supabase, [input()]),
      /apply_pons_v2_curve_fees RPC failed/,
    );
  });

  it("empty batch does not call RPC", async () => {
    let called = false;
    const supabase = {
      rpc() {
        called = true;
        return Promise.resolve({ data: null, error: null });
      },
    } as unknown as WorkerSupabase;
    const result = await applyPonsV2CurveFeeBatch(supabase, []);
    assert.equal(called, false);
    assert.deepEqual(result, { status: "ok", applied: 0, skipped: 0 });
  });

  it("maps PostgREST numeric strings to exact decimal strings", () => {
    const metrics = mapTokenFeeMetricsRow({
      chain_id: 4663,
      token_address: TOKEN,
      launchpad: "pons",
      factory_version: "v2",
      quote_token_address: QUOTE,
      global_fees_paid_quote: "9007199254740993000008",
      buy_fees_quote: HUGE,
      sell_fees_quote: "7",
      buy_count: 1,
      sell_count: 1,
      last_fee_block: "88",
    });
    assert.equal(metrics.globalFeesPaidQuote, "9007199254740993000008");
    assert.equal(metrics.buyFeesQuote, HUGE);
    assert.equal(metrics.sellFeesQuote, "7");
    assert.equal(metrics.lastFeeBlock, 88);
    assert.equal(metrics.quoteTokenAddress, QUOTE);

    const event = mapCurveFeeEventRow({
      chain_id: 4663,
      token_address: TOKEN,
      curve_address: CURVE,
      tx_hash: TX,
      log_index: 3,
      block_number: "42",
      side: "buy",
      fee_raw: HUGE,
      tax_raw: "7",
      total_fee_raw: "9007199254740993000008",
      venue: "curve",
    });
    assert.equal(event.feeRaw, HUGE);
    assert.equal(event.taxRaw, "7");
    assert.equal(event.totalFeeRaw, "9007199254740993000008");
    assert.equal(event.venue, "curve");
  });

  it("accepts PostgREST JSON numbers that fit in a safe integer (live specimen)", () => {
    // Production SELECT returned global_fees_paid_quote as JSON number
    // 5606869752000000, which threw: "numeric value must be a decimal string, not number"
    assert.equal(
      mapDbNumericToDecimalString(5_606_869_752_000_000, "global_fees_paid_quote"),
      "5606869752000000",
    );
    assert.equal(mapDbNumericToDecimalString(10, "buy_count_amount"), "10");
    const metrics = mapTokenFeeMetricsRow({
      chain_id: 4663,
      token_address: TOKEN,
      launchpad: "pons",
      factory_version: "v2",
      quote_token_address: QUOTE,
      global_fees_paid_quote: 5_606_869_752_000_000,
      buy_fees_quote: 5_606_869_752_000_000,
      sell_fees_quote: 0,
      buy_count: 1,
      sell_count: 0,
      last_fee_block: 33_486_660,
    });
    assert.equal(metrics.globalFeesPaidQuote, "5606869752000000");
    const event = mapCurveFeeEventRow({
      chain_id: 4663,
      token_address: TOKEN,
      curve_address: CURVE,
      tx_hash: TX,
      log_index: 12,
      block_number: 33_486_660,
      side: "buy",
      fee_raw: 4_921_433_352_000_000,
      tax_raw: 685_436_400_000_000,
      total_fee_raw: 5_606_869_752_000_000,
      venue: "curve",
    });
    assert.equal(event.feeRaw, "4921433352000000");
    assert.equal(event.taxRaw, "685436400000000");
    assert.equal(event.totalFeeRaw, "5606869752000000");
  });

  it("rejects float/scientific/unsafe numeric mapping", () => {
    for (const value of [
      1.5,
      -1,
      Number.MAX_SAFE_INTEGER + 1,
      "1e18",
      "1.0",
      "1E18",
    ] as const) {
      let threw = false;
      try {
        mapDbNumericToDecimalString(value);
      } catch {
        threw = true;
      }
      assert.equal(threw, true, `expected reject for ${String(value)}`);
    }
  });

  it("round-trips 303733000000000000 exactly as a decimal string", () => {
    const exact = "303733000000000000";
    assert.equal(mapDbNumericToDecimalString(exact, "global_fees_paid_quote"), exact);
    assert.ok(BigInt(exact) > BigInt(Number.MAX_SAFE_INTEGER));
    assert.equal(Number.isSafeInteger(Number(exact)), false);
    const metrics = mapTokenFeeMetricsRow({
      chain_id: 4663,
      token_address: TOKEN,
      launchpad: "pons",
      factory_version: "v2",
      quote_token_address: QUOTE,
      global_fees_paid_quote: exact,
      buy_fees_quote: exact,
      sell_fees_quote: "0",
      buy_count: 1,
      sell_count: 0,
      last_fee_block: 1,
    });
    assert.equal(metrics.globalFeesPaidQuote, exact);
    assert.throws(
      () => mapDbNumericToDecimalString(Number(exact), "global_fees_paid_quote"),
    );
  });

  it("SELECT lists cast uint256 numerics to text", () => {
    assert.ok(TOKEN_FEE_METRICS_SELECT.includes("global_fees_paid_quote::text"));
    assert.ok(TOKEN_FEE_METRICS_SELECT.includes("buy_fees_quote::text"));
    assert.ok(TOKEN_FEE_METRICS_SELECT.includes("sell_fees_quote::text"));
    assert.ok(CURVE_FEE_EVENT_COLUMNS.includes("fee_raw::text"));
    assert.ok(CURVE_FEE_EVENT_COLUMNS.includes("tax_raw::text"));
    assert.ok(CURVE_FEE_EVENT_COLUMNS.includes("total_fee_raw::text"));
  });

  it("load helpers query the dedicated tables", async () => {
    const supabase = {
      from(table: string) {
        if (table === "token_fee_metrics") {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        maybeSingle() {
                          return Promise.resolve({
                            data: {
                              chain_id: 4663,
                              token_address: TOKEN,
                              launchpad: "pons",
                              factory_version: "v2",
                              quote_token_address: QUOTE,
                              global_fees_paid_quote: "13",
                              buy_fees_quote: "13",
                              sell_fees_quote: "0",
                              buy_count: 1,
                              sell_count: 0,
                              last_fee_block: 100,
                            },
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
        }
        if (table === "pons_v2_curve_fee_events") {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        eq() {
                          return {
                            maybeSingle() {
                              return Promise.resolve({
                                data: {
                                  chain_id: 4663,
                                  token_address: TOKEN,
                                  curve_address: CURVE,
                                  tx_hash: TX,
                                  log_index: 7,
                                  block_number: 100,
                                  side: "buy",
                                  fee_raw: "10",
                                  tax_raw: "3",
                                  total_fee_raw: "13",
                                  venue: "curve",
                                },
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
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as unknown as WorkerSupabase;

    const metrics = await loadTokenFeeMetrics(supabase, 4663, TOKEN);
    assert.ok(metrics);
    assert.equal(metrics.globalFeesPaidQuote, "13");
    const ledger = await loadPonsV2CurveFeeEvent(supabase, 4663, TX, 7);
    assert.ok(ledger);
    assert.equal(ledger.totalFeeRaw, "13");
  });

  it("pure apply remains the accumulation contract used by tests", () => {
    const store = createPonsV2CurveFeeStore();
    applyPonsV2CurveFeeBatchPure(store, [input({ feeRaw: BigInt(10), taxRaw: BigInt(3) })]);
    const metrics = loadTokenFeeMetricsFromStore(store, 4663, TOKEN);
    assert.equal(metrics?.globalFeesPaidQuote, "13");
  });
});
