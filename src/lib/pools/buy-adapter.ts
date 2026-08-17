/**
 * POOLS Instant buy-direction seam (Phase 1).
 *
 * PONS market→wallet Transfer detection is not reusable.
 * Instant buys are Uniswap v4 Swap logs on a known poolId:
 *   launched-token delta > 0  →  swapper received the launched token  →  buy
 * Buyer wallet is tx.from (Swap.sender is often a router), Phase 2.
 */

import type { Address } from "@/lib/pons/types";
import type { LaunchedTokenCurrencyIndex } from "@/lib/pools/launch-discovery/types";
import { normalizeAddress } from "@/lib/worker/normalize";

export type PoolsPoolOrientation = {
  poolId: string;
  launchedTokenAddress: Address;
  launchedTokenCurrencyIndex: LaunchedTokenCurrencyIndex;
};

export type PoolsSwapAmounts = {
  amount0: bigint;
  amount1: bigint;
};

/**
 * True when the Swap's launched-token delta is strictly positive.
 * Does not assume amount0 < 0 means buy — direction follows the persisted index.
 *
 * Confirmed Instant specimen (currency0 = native ETH, currency1 = token):
 *   buy  → amount1 > 0
 *   sell → amount1 < 0
 */
export function isPoolsInstantBuySwap(
  orientation: PoolsPoolOrientation,
  swap: PoolsSwapAmounts,
): boolean {
  const launchedDelta =
    orientation.launchedTokenCurrencyIndex === 0
      ? swap.amount0
      : swap.amount1;
  return launchedDelta > BigInt(0);
}

/** Phase 2 buyer identity: transaction origin, not Swap.sender. */
export function poolsInstantBuyerFromTx(txFrom: string): Address {
  return normalizeAddress(txFrom);
}

/**
 * Minimum adapter contract for the Phase 2 activity scanner.
 * Not wired into pons_transfers.
 */
export type PoolsBuyAdapter = {
  isBuySwap(
    orientation: PoolsPoolOrientation,
    swap: PoolsSwapAmounts,
  ): boolean;
  buyerAddress(txFrom: string): Address;
};

export const poolsInstantBuyAdapter: PoolsBuyAdapter = {
  isBuySwap: isPoolsInstantBuySwap,
  buyerAddress: poolsInstantBuyerFromTx,
};
