/**
 * Atomic PONS V2 curve-fee accumulation: ledger insert + metrics upsert.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPonsV2CurveFeeBatchPure,
  createPonsV2CurveFeeStore,
  loadCurveFeeEventFromStore,
  loadTokenFeeMetricsFromStore,
} from "@/lib/pons/curve-fee/apply";
import { decimalStringToUint256 } from "@/lib/pons/curve-fee/numeric";
import type { PonsV2CurveFeeApplyInput } from "@/lib/pons/curve-fee/types";

const CHAIN = 4663;
const TOKEN_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const CURVE_A = "0xcccccccccccccccccccccccccccccccccccccccc";
const CURVE_B = "0xdddddddddddddddddddddddddddddddddddddddd";
const QUOTE_ETH = "0x0000000000000000000000000000000000000000";
const QUOTE_OTHER = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const TX_1 =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const TX_2 =
  "0x2222222222222222222222222222222222222222222222222222222222222222";
const TX_3 =
  "0x3333333333333333333333333333333333333333333333333333333333333333";
const TX_4 =
  "0x4444444444444444444444444444444444444444444444444444444444444444";

const HUGE_FEE = BigInt("9007199254740993000001");
const HUGE_TAX = BigInt("9007199254740993000007");

function event(
  overrides: Partial<PonsV2CurveFeeApplyInput> &
    Pick<PonsV2CurveFeeApplyInput, "txHash" | "logIndex" | "side">,
): PonsV2CurveFeeApplyInput {
  return {
    chainId: CHAIN,
    tokenAddress: TOKEN_A,
    curveAddress: CURVE_A,
    blockNumber: 100,
    feeRaw: BigInt(10),
    taxRaw: BigInt(3),
    quoteTokenAddress: QUOTE_ETH,
    ...overrides,
  };
}

describe("applyPonsV2CurveFeeBatchPure", () => {
  it("6. first event inserts a ledger row and updates the aggregate", () => {
    const store = createPonsV2CurveFeeStore();
    const result = applyPonsV2CurveFeeBatchPure(store, [
      event({ txHash: TX_1, logIndex: 7, side: "buy", feeRaw: BigInt(10), taxRaw: BigInt(3) }),
    ]);
    assert.deepEqual(result, { status: "ok", applied: 1, skipped: 0 });

    const ledger = loadCurveFeeEventFromStore(store, CHAIN, TX_1, 7);
    assert.ok(ledger);
    assert.equal(ledger.side, "buy");
    assert.equal(ledger.feeRaw, "10");
    assert.equal(ledger.taxRaw, "3");
    assert.equal(ledger.totalFeeRaw, "13");
    assert.equal(ledger.venue, "curve");

    const metrics = loadTokenFeeMetricsFromStore(store, CHAIN, TOKEN_A);
    assert.ok(metrics);
    assert.equal(metrics.launchpad, "pons");
    assert.equal(metrics.factoryVersion, "v2");
    assert.equal(metrics.globalFeesPaidQuote, "13");
    assert.equal(metrics.buyFeesQuote, "13");
    assert.equal(metrics.sellFeesQuote, "0");
    assert.equal(metrics.buyCount, 1);
    assert.equal(metrics.sellCount, 0);
    assert.equal(metrics.lastFeeBlock, 100);
    assert.equal(metrics.quoteTokenAddress, QUOTE_ETH);
  });

  it("7. duplicate tx_hash/log_index does not increment the aggregate", () => {
    const store = createPonsV2CurveFeeStore();
    const first = event({
      txHash: TX_1,
      logIndex: 7,
      side: "buy",
      feeRaw: BigInt(10),
      taxRaw: BigInt(3),
    });
    applyPonsV2CurveFeeBatchPure(store, [first]);
    const replay = applyPonsV2CurveFeeBatchPure(store, [
      { ...first, feeRaw: BigInt(99), taxRaw: BigInt(99), blockNumber: 999 },
    ]);
    assert.deepEqual(replay, { status: "ok", applied: 0, skipped: 1 });

    assert.equal(store.events.size, 1);
    const metrics = loadTokenFeeMetricsFromStore(store, CHAIN, TOKEN_A);
    assert.ok(metrics);
    assert.equal(metrics.globalFeesPaidQuote, "13");
    assert.equal(metrics.buyCount, 1);
    assert.equal(metrics.lastFeeBlock, 100);
  });

  it("8. two buys accumulate correctly", () => {
    const store = createPonsV2CurveFeeStore();
    applyPonsV2CurveFeeBatchPure(store, [
      event({ txHash: TX_1, logIndex: 1, side: "buy", feeRaw: BigInt(10), taxRaw: BigInt(1) }),
      event({ txHash: TX_2, logIndex: 2, side: "buy", feeRaw: BigInt(20), taxRaw: BigInt(2) }),
    ]);
    const metrics = loadTokenFeeMetricsFromStore(store, CHAIN, TOKEN_A);
    assert.ok(metrics);
    assert.equal(metrics.globalFeesPaidQuote, "33");
    assert.equal(metrics.buyFeesQuote, "33");
    assert.equal(metrics.sellFeesQuote, "0");
    assert.equal(metrics.buyCount, 2);
    assert.equal(metrics.sellCount, 0);
  });

  it("9. buy + sell accumulate into global and separate side buckets", () => {
    const store = createPonsV2CurveFeeStore();
    applyPonsV2CurveFeeBatchPure(store, [
      event({ txHash: TX_1, logIndex: 1, side: "buy", feeRaw: BigInt(10), taxRaw: BigInt(5) }),
      event({ txHash: TX_2, logIndex: 2, side: "sell", feeRaw: BigInt(7), taxRaw: BigInt(1) }),
    ]);
    const metrics = loadTokenFeeMetricsFromStore(store, CHAIN, TOKEN_A);
    assert.ok(metrics);
    assert.equal(metrics.buyFeesQuote, "15");
    assert.equal(metrics.sellFeesQuote, "8");
    assert.equal(metrics.globalFeesPaidQuote, "23");
    assert.equal(metrics.buyCount, 1);
    assert.equal(metrics.sellCount, 1);
  });

  it("10. multiple tokens stay isolated", () => {
    const store = createPonsV2CurveFeeStore();
    applyPonsV2CurveFeeBatchPure(store, [
      event({
        txHash: TX_1,
        logIndex: 1,
        side: "buy",
        tokenAddress: TOKEN_A,
        curveAddress: CURVE_A,
        feeRaw: BigInt(10),
        taxRaw: BigInt(0),
      }),
      event({
        txHash: TX_2,
        logIndex: 1,
        side: "sell",
        tokenAddress: TOKEN_B,
        curveAddress: CURVE_B,
        feeRaw: BigInt(4),
        taxRaw: BigInt(6),
      }),
    ]);
    const a = loadTokenFeeMetricsFromStore(store, CHAIN, TOKEN_A);
    const b = loadTokenFeeMetricsFromStore(store, CHAIN, TOKEN_B);
    assert.ok(a);
    assert.ok(b);
    assert.equal(a.globalFeesPaidQuote, "10");
    assert.equal(a.buyCount, 1);
    assert.equal(a.sellCount, 0);
    assert.equal(b.globalFeesPaidQuote, "10");
    assert.equal(b.buyCount, 0);
    assert.equal(b.sellCount, 1);
    assert.equal(a.tokenAddress, TOKEN_A);
    assert.equal(b.tokenAddress, TOKEN_B);
  });

  it("11. last_fee_block only moves forward", () => {
    const store = createPonsV2CurveFeeStore();
    applyPonsV2CurveFeeBatchPure(store, [
      event({ txHash: TX_1, logIndex: 1, side: "buy", blockNumber: 500 }),
      event({ txHash: TX_2, logIndex: 1, side: "buy", blockNumber: 400 }),
      event({ txHash: TX_3, logIndex: 1, side: "sell", blockNumber: 550 }),
      event({ txHash: TX_4, logIndex: 1, side: "buy", blockNumber: 549 }),
    ]);
    const metrics = loadTokenFeeMetricsFromStore(store, CHAIN, TOKEN_A);
    assert.ok(metrics);
    assert.equal(metrics.lastFeeBlock, 550);
    assert.equal(metrics.buyCount, 3);
    assert.equal(metrics.sellCount, 1);
  });

  it("12. quote_token_address is preserved on later upserts", () => {
    const store = createPonsV2CurveFeeStore();
    applyPonsV2CurveFeeBatchPure(store, [
      event({
        txHash: TX_1,
        logIndex: 1,
        side: "buy",
        quoteTokenAddress: QUOTE_ETH,
      }),
      event({
        txHash: TX_2,
        logIndex: 1,
        side: "sell",
        quoteTokenAddress: QUOTE_OTHER,
      }),
    ]);
    const metrics = loadTokenFeeMetricsFromStore(store, CHAIN, TOKEN_A);
    assert.ok(metrics);
    assert.equal(metrics.quoteTokenAddress, QUOTE_ETH);
    assert.notEqual(metrics.quoteTokenAddress, QUOTE_OTHER);
  });

  it("13. numeric(78,0) values round-trip as exact decimal strings/bigints", () => {
    const store = createPonsV2CurveFeeStore();
    applyPonsV2CurveFeeBatchPure(store, [
      event({
        txHash: TX_1,
        logIndex: 1,
        side: "buy",
        feeRaw: HUGE_FEE,
        taxRaw: HUGE_TAX,
      }),
      event({
        txHash: TX_2,
        logIndex: 1,
        side: "sell",
        feeRaw: HUGE_FEE.toString(10),
        taxRaw: "0",
      }),
    ]);
    const metrics = loadTokenFeeMetricsFromStore(store, CHAIN, TOKEN_A);
    assert.ok(metrics);
    const expected = HUGE_FEE + HUGE_TAX + HUGE_FEE;
    assert.equal(metrics.globalFeesPaidQuote, expected.toString(10));
    assert.equal(
      decimalStringToUint256(metrics.globalFeesPaidQuote),
      expected,
    );
    assert.equal(
      decimalStringToUint256(metrics.buyFeesQuote),
      HUGE_FEE + HUGE_TAX,
    );
    assert.equal(decimalStringToUint256(metrics.sellFeesQuote), HUGE_FEE);
    assert.notEqual(
      metrics.globalFeesPaidQuote,
      String(Number(expected)),
    );
    const ledger = loadCurveFeeEventFromStore(store, CHAIN, TX_1, 1);
    assert.ok(ledger);
    assert.equal(ledger.feeRaw, HUGE_FEE.toString(10));
    assert.equal(ledger.taxRaw, HUGE_TAX.toString(10));
  });
});
