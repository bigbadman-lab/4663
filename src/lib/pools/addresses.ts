/**
 * Empirically confirmed POOLS Instant addresses and event topic0s.
 * Do not add Crowd Launch or other InstantLaunchStrategy deployments.
 */

import { getAddress, zeroAddress } from "viem";

/** InstantLaunchStrategy v3.2.0 on Robinhood Chain (checksum). */
export const POOLS_INSTANT_STRATEGY_V3_2_0_CHECKSUM = getAddress(
  "0x23f8209572b4a1C2AD88A42749E830791Fb027f1",
);

/** Lowercase storage / filter form. */
export const POOLS_INSTANT_STRATEGY_V3_2_0 =
  POOLS_INSTANT_STRATEGY_V3_2_0_CHECKSUM.toLowerCase() as `0x${string}`;

/**
 * TokenLaunched(bytes32 indexed poolId, address indexed token,
 *   address indexed finalPositionRecipient, PoolKey key)
 */
export const POOLS_TOKEN_LAUNCHED_TOPIC0 =
  "0x3b3d2bafdcae274a232217e1f80ee4305d3af6aa25c8b14b1681bd68d18042a4" as const;

/** Uniswap v4 native currency sentinel (currency0 on Instant pools). */
export const POOLS_NATIVE_ETH = zeroAddress.toLowerCase() as `0x${string}`;

/**
 * Robinhood Chain Uniswap v4 PoolManager singleton.
 * Source: Uniswap Liquidity Launcher / Bitquery Pools.trade Robinhood v4 docs,
 * centralized here so the generic ChainRpc layer stays Uniswap-unaware.
 * Instant activity scans Swap logs here; Instant discovery still filters the strategy.
 */
export const RHC_UNISWAP_V4_POOL_MANAGER_CHECKSUM = getAddress(
  "0x8366a39cc670b4001a1121b8f6a443a643e40951",
);

export const RHC_UNISWAP_V4_POOL_MANAGER =
  RHC_UNISWAP_V4_POOL_MANAGER_CHECKSUM.toLowerCase() as `0x${string}`;

/**
 * Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1,
 *   uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)
 */
export const POOLS_V4_SWAP_TOPIC0 =
  "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f" as const;
