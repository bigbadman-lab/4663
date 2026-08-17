import type { Address, TxHash } from "@/lib/pons/types";

export type PoolsInstantSourceVersion = "instant-v3.2.0";

export type LaunchedTokenCurrencyIndex = 0 | 1;

export type PoolsPoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

/** Decoded Instant TokenLaunched — not yet timestamp-resolved. */
export type ExtractedPoolsInstantLaunch = {
  launchpad: "pools";
  sourceContract: Address;
  sourceVersion: PoolsInstantSourceVersion;
  poolId: string;
  tokenAddress: Address;
  finalPositionRecipient: Address;
  poolKey: PoolsPoolKey;
  launchedTokenCurrencyIndex: LaunchedTokenCurrencyIndex;
  launchTxHash: TxHash;
  launchBlockNumber: number;
  logIndex: number;
};

/** Durable insert shape for pools_instant_launches. */
export type ResolvedPoolsInstantLaunch = {
  chainId: number;
  launchpad: "pools";
  tokenAddress: Address;
  launchTxHash: TxHash;
  launchBlockNumber: number;
  launchBlockTimestampIso: string;
  launchBlockTimestampUnix: number;
  sourceContract: Address;
  sourceVersion: PoolsInstantSourceVersion;
  poolId: string;
  finalPositionRecipient: Address;
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooksAddress: Address;
  launchedTokenCurrencyIndex: LaunchedTokenCurrencyIndex;
};
