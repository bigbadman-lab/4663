/**
 * PONS V2 CurveBuy / CurveSell decoder.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeAbiParameters, pad, parseAbiParameters, toEventSelector } from "viem";
import {
  PONS_V2_CURVE_BUY_TOPIC0,
  PONS_V2_CURVE_SELL_TOPIC0,
} from "@/lib/pons/curve-fee/constants";
import {
  decodePonsV2CurveFeeLog,
  PONS_V2_CURVE_BUY_EVENT,
  PONS_V2_CURVE_SELL_EVENT,
} from "@/lib/pons/curve-fee/decode";
import { addQuoteAmounts } from "@/lib/pons/curve-fee/numeric";
import type { PonsV2CurveFeeLogLike } from "@/lib/pons/curve-fee/types";

const BUYER = "0x1111111111111111111111111111111111111111";
const SELLER = "0x3333333333333333333333333333333333333333";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const CURVE = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TX =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TRANSFER_TOPIC0 =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** Above Number.MAX_SAFE_INTEGER; still well inside uint256 / numeric(78,0). */
const HUGE_FEE = BigInt("9007199254740993000001");
const HUGE_TAX = BigInt("9007199254740993000007");

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

function encodeCurveSell(fee: bigint, tax: bigint) {
  return {
    topics: [
      PONS_V2_CURVE_SELL_TOPIC0,
      pad(SELLER as `0x${string}`),
      pad(RECIPIENT as `0x${string}`),
    ],
    data: encodeAbiParameters(
      parseAbiParameters("uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax"),
      [BigInt(42), BigInt("900000000000000000"), fee, tax],
    ),
  };
}

function buyLog(overrides: Partial<PonsV2CurveFeeLogLike> = {}) {
  const encoded = encodeCurveBuy(BigInt(1_000_000_000_000_000), BigInt(2_000_000_000_000_000));
  return {
    address: CURVE,
    blockNumber: 35_000_201,
    transactionHash: TX,
    logIndex: 4,
    topics: encoded.topics,
    data: encoded.data,
    ...overrides,
  } satisfies PonsV2CurveFeeLogLike;
}

function sellLog(overrides: Partial<PonsV2CurveFeeLogLike> = {}) {
  const encoded = encodeCurveSell(BigInt(3_000_000_000_000_000), BigInt(4_000_000_000_000_000));
  return {
    address: CURVE,
    blockNumber: 35_000_202,
    transactionHash: TX,
    logIndex: 5,
    topics: encoded.topics,
    data: encoded.data,
    ...overrides,
  } satisfies PonsV2CurveFeeLogLike;
}

function hugeBuyLog() {
  const encoded = encodeCurveBuy(HUGE_FEE, HUGE_TAX);
  return {
    address: CURVE,
    blockNumber: 1,
    transactionHash: TX,
    logIndex: 0,
    topics: encoded.topics,
    data: encoded.data,
  } satisfies PonsV2CurveFeeLogLike;
}

describe("decodePonsV2CurveFeeLog", () => {
  it("1. decodes CurveBuy fee and tax from the canonical topic0", () => {
    assert.equal(toEventSelector(PONS_V2_CURVE_BUY_EVENT), PONS_V2_CURVE_BUY_TOPIC0);
    const decoded = decodePonsV2CurveFeeLog(buyLog());
    assert.ok(decoded);
    assert.equal(decoded.side, "buy");
    assert.equal(decoded.curveAddress, CURVE);
    assert.equal(decoded.txHash, TX);
    assert.equal(decoded.logIndex, 4);
    assert.equal(decoded.blockNumber, 35_000_201);
    assert.equal(decoded.fee, BigInt(1_000_000_000_000_000));
    assert.equal(decoded.tax, BigInt(2_000_000_000_000_000));
    assert.equal(decoded.totalFee, BigInt(3_000_000_000_000_000));
    assert.equal(decoded.feeRaw, "1000000000000000");
    assert.equal(decoded.taxRaw, "2000000000000000");
    assert.equal(decoded.totalFeeRaw, "3000000000000000");
    assert.equal(typeof decoded.fee, "bigint");
    assert.equal(typeof decoded.totalFee, "bigint");
  });

  it("2. decodes CurveSell fee and tax from the canonical topic0", () => {
    assert.equal(
      toEventSelector(PONS_V2_CURVE_SELL_EVENT),
      PONS_V2_CURVE_SELL_TOPIC0,
    );
    const decoded = decodePonsV2CurveFeeLog(sellLog());
    assert.ok(decoded);
    assert.equal(decoded.side, "sell");
    assert.equal(decoded.curveAddress, CURVE);
    assert.equal(decoded.fee, BigInt(3_000_000_000_000_000));
    assert.equal(decoded.tax, BigInt(4_000_000_000_000_000));
    assert.equal(decoded.totalFee, BigInt(7_000_000_000_000_000));
    assert.equal(decoded.totalFeeRaw, "7000000000000000");
  });

  it("3. fee + tax arithmetic stays exact above JS safe integer range", () => {
    assert.ok(HUGE_FEE > BigInt(Number.MAX_SAFE_INTEGER));
    assert.ok(HUGE_TAX > BigInt(Number.MAX_SAFE_INTEGER));
    const decoded = decodePonsV2CurveFeeLog(hugeBuyLog());
    assert.ok(decoded);
    const expected = addQuoteAmounts(HUGE_FEE, HUGE_TAX);
    assert.equal(decoded.fee, HUGE_FEE);
    assert.equal(decoded.tax, HUGE_TAX);
    assert.equal(decoded.totalFee, expected);
    assert.equal(decoded.feeRaw, HUGE_FEE.toString(10));
    assert.equal(decoded.taxRaw, HUGE_TAX.toString(10));
    assert.equal(decoded.totalFeeRaw, expected.toString(10));
    assert.notEqual(decoded.totalFeeRaw, String(Number(expected)));
    assert.equal(decoded.totalFee, HUGE_FEE + HUGE_TAX);
  });

  it("4. rejects the wrong topic0", () => {
    const log = buyLog({
      topics: [TRANSFER_TOPIC0, ...(buyLog().topics.slice(1) as string[])],
    });
    assert.equal(decodePonsV2CurveFeeLog(log), null);
    assert.equal(
      decodePonsV2CurveFeeLog(buyLog({ topics: [PONS_V2_CURVE_SELL_TOPIC0] })),
      null,
    );
  });

  it("5. rejects malformed logs", () => {
    const good = buyLog();
    assert.equal(
      decodePonsV2CurveFeeLog({ ...good, data: "0xdead" }),
      null,
    );
    assert.equal(
      decodePonsV2CurveFeeLog({ ...good, data: "0x" }),
      null,
    );
    assert.equal(
      decodePonsV2CurveFeeLog({ ...good, topics: [PONS_V2_CURVE_BUY_TOPIC0] }),
      null,
    );
    assert.equal(
      decodePonsV2CurveFeeLog({ ...good, transactionHash: null }),
      null,
    );
    assert.equal(
      decodePonsV2CurveFeeLog({ ...good, blockNumber: null }),
      null,
    );
    assert.equal(
      decodePonsV2CurveFeeLog({ ...good, logIndex: null }),
      null,
    );
    assert.equal(
      decodePonsV2CurveFeeLog({ ...good, address: "not-an-address" }),
      null,
    );
  });
});
