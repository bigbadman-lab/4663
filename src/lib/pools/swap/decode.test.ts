/**
 * Uniswap v4 Swap decoder — confirmed Robinhood PoolManager specimen.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeAbiParameters, pad, parseAbiParameters, toEventSelector } from "viem";
import {
  POOLS_V4_SWAP_TOPIC0,
  RHC_UNISWAP_V4_POOL_MANAGER,
} from "@/lib/pools/addresses";
import { isPoolsInstantBuySwap } from "@/lib/pools/buy-adapter";
import {
  decodePoolsV4Swap,
  extractPoolsV4SwapsFromLogs,
  POOLS_V4_SWAP_EVENT,
} from "@/lib/pools/swap/decode";

const SPECIMEN_TOKEN =
  "0x87380657B18Eb20B57B66d9759De4262d2531Fa2".toLowerCase();
const SPECIMEN_POOL_ID =
  "0xf880faadd73dd6eca13ee7d1e3958e6aef3e65a114b4123fb4007f6069406444";
const INTERMEDIARY = "0x1111111111111111111111111111111111111111";
const TX =
  "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

const BUY_AMOUNT0 = BigInt("-40873308865915953");
const BUY_AMOUNT1 = BigInt("16000000000000000000000000");
const SELL_AMOUNT0 = BigInt("40687478284752095");
const SELL_AMOUNT1 = BigInt("-16000000000000000000000000");

function encodeSwap(amount0: bigint, amount1: bigint, poolId = SPECIMEN_POOL_ID) {
  return {
    topics: [
      POOLS_V4_SWAP_TOPIC0,
      poolId as `0x${string}`,
      pad(INTERMEDIARY as `0x${string}`),
    ],
    data: encodeAbiParameters(
      parseAbiParameters(
        "int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee",
      ),
      [amount0, amount1, BigInt(2) ** BigInt(96), BigInt(1), 0, 2500],
    ),
  };
}

function specimenLog(
  amount0: bigint,
  amount1: bigint,
  overrides: Record<string, unknown> = {},
) {
  const encoded = encodeSwap(amount0, amount1);
  return {
    address: RHC_UNISWAP_V4_POOL_MANAGER,
    blockNumber: 35_000_200,
    transactionHash: TX,
    logIndex: 7,
    topics: encoded.topics,
    data: encoded.data,
    ...overrides,
  };
}

const currency1 = {
  poolId: SPECIMEN_POOL_ID,
  launchedTokenAddress: SPECIMEN_TOKEN,
  launchedTokenCurrencyIndex: 1 as const,
};

describe("decodePoolsV4Swap", () => {
  it("matches the canonical PoolManager Swap topic0", () => {
    assert.equal(toEventSelector(POOLS_V4_SWAP_EVENT), POOLS_V4_SWAP_TOPIC0);
  });

  it("decodes the confirmed BUY specimen (currency1 out of pool)", () => {
    const decoded = decodePoolsV4Swap(specimenLog(BUY_AMOUNT0, BUY_AMOUNT1));
    assert.ok(decoded);
    assert.equal(decoded.poolId, SPECIMEN_POOL_ID);
    assert.equal(decoded.sender, INTERMEDIARY);
    assert.equal(decoded.amount0, BUY_AMOUNT0);
    assert.equal(decoded.amount1, BUY_AMOUNT1);
    assert.equal(
      isPoolsInstantBuySwap(currency1, {
        amount0: decoded.amount0,
        amount1: decoded.amount1,
      }),
      true,
    );
  });

  it("decodes the confirmed SELL specimen as not a buy", () => {
    const decoded = decodePoolsV4Swap(specimenLog(SELL_AMOUNT0, SELL_AMOUNT1));
    assert.ok(decoded);
    assert.equal(
      isPoolsInstantBuySwap(currency1, {
        amount0: decoded.amount0,
        amount1: decoded.amount1,
      }),
      false,
    );
  });

  it("same signs with launched token index 0 invert BUY/SELL", () => {
    const currency0 = {
      ...currency1,
      launchedTokenCurrencyIndex: 0 as const,
    };
    assert.equal(
      isPoolsInstantBuySwap(currency0, {
        amount0: BUY_AMOUNT0,
        amount1: BUY_AMOUNT1,
      }),
      false,
    );
    assert.equal(
      isPoolsInstantBuySwap(currency0, {
        amount0: SELL_AMOUNT0,
        amount1: SELL_AMOUNT1,
      }),
      true,
    );
  });

  it("rejects wrong PoolManager", () => {
    assert.equal(
      decodePoolsV4Swap(
        specimenLog(BUY_AMOUNT0, BUY_AMOUNT1, {
          address: "0x0000000000000000000000000000000000000001",
        }),
      ),
      null,
    );
  });

  it("rejects wrong topic0", () => {
    const log = specimenLog(BUY_AMOUNT0, BUY_AMOUNT1);
    assert.equal(
      decodePoolsV4Swap({
        ...log,
        topics: [
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          ...log.topics.slice(1),
        ],
      }),
      null,
    );
  });

  it("counts malformed target Swap logs", () => {
    const good = specimenLog(BUY_AMOUNT0, BUY_AMOUNT1);
    const { decoded, malformed } = extractPoolsV4SwapsFromLogs([
      good,
      {
        ...good,
        data: "0x",
      },
    ]);
    assert.equal(decoded.length, 1);
    assert.equal(malformed, 1);
  });
});
