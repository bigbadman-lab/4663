import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPoolsInstantBuySwap,
  poolsInstantBuyAdapter,
  poolsInstantBuyerFromTx,
} from "@/lib/pools/buy-adapter";

const TOKEN = "0x87380657b18eb20b57b66d9759de4262d2531fa2";
const POOL_ID =
  "0xf880faadd73dd6eca13ee7d1e3958e6aef3e65a114b4123fb4007f6069406444";

const specimenOrientation = {
  poolId: POOL_ID,
  launchedTokenAddress: TOKEN,
  launchedTokenCurrencyIndex: 1 as const,
};

describe("POOLS Instant buy-direction classifier", () => {
  it("specimen: token is currency1, amount1 > 0 is a buy", () => {
    assert.equal(
      isPoolsInstantBuySwap(specimenOrientation, {
        amount0: BigInt("-40873308865915953"),
        amount1: BigInt("16000000000000000000000000"),
      }),
      true,
    );
  });

  it("specimen: amount1 < 0 is a sell, not a buy", () => {
    assert.equal(
      isPoolsInstantBuySwap(specimenOrientation, {
        amount0: BigInt("40687478284752095"),
        amount1: BigInt("-16000000000000000000000000"),
      }),
      false,
    );
  });

  it("does not hardcode amount0 < 0 as buy when token is currency0", () => {
    const tokenIsCurrency0 = {
      poolId: POOL_ID,
      launchedTokenAddress: TOKEN,
      launchedTokenCurrencyIndex: 0 as const,
    };
    assert.equal(
      isPoolsInstantBuySwap(tokenIsCurrency0, {
        amount0: BigInt(-1),
        amount1: BigInt(10),
      }),
      false,
    );
    assert.equal(
      isPoolsInstantBuySwap(tokenIsCurrency0, {
        amount0: BigInt(10),
        amount1: BigInt(-1),
      }),
      true,
    );
  });

  it("buyer identity is tx.from, not Swap.sender", () => {
    const txFrom = "0x1111111111111111111111111111111111111111";
    assert.equal(poolsInstantBuyerFromTx(txFrom), txFrom);
    assert.equal(
      poolsInstantBuyAdapter.buyerAddress(
        "0x1111111111111111111111111111111111111111",
      ),
      txFrom,
    );
    assert.equal(
      poolsInstantBuyAdapter.isBuySwap(specimenOrientation, {
        amount0: BigInt(-2),
        amount1: BigInt(5),
      }),
      true,
    );
  });
});
