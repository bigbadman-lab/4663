/**
 * Launchpad-neutral RADAR read model.
 *
 * A future RADAR module should consume these types and must not need
 * PONS factories, PONS markets, Uniswap PoolManager, or POOLS pool IDs.
 * Source-specific display fields stay optional and explicit.
 */

import type { Launchpad } from "@/lib/radar/launchpad";

export type { Launchpad };

/**
 * Shared launch facts after source-specific discovery.
 * Persistence may remain per-source; this is the cross-launchpad view.
 */
export type RadarLaunchRef = {
  launchpad: Launchpad;
  tokenAddress: string;
  txHash: string;
  blockNumber: number;
  launchedAt: string;
  sourceContract: string;
};

/**
 * First-buyer facts after source-specific persistence.
 * RADAR consumers must not need PoolManager, poolId, or PONS market.
 */
export type RadarFirstBuyer = {
  launchpad: Launchpad;
  tokenAddress: string;
  walletAddress: string;
  firstBuyTxHash: string;
  firstBuyBlockNumber: number;
  firstBuyBlockTimestamp: string;
};

/** Qualification that can enter the aggregated watchlist / alerts. */
export type RadarQualification = {
  eventId: string;
  tokenAddress: string;
  launchpad: Launchpad;
  occurredAt: string;
};

/**
 * Public watchlist row. Buyer metrics are continuation-window counts,
 * not launchpad-internal market details.
 */
export type RadarWatchlistToken = {
  eventId: string;
  tokenAddress: string;
  launchpad: Launchpad;
  launchTimestamp: string | null;
  /** Qualification time (second continuation first-buy). */
  continuationTimestamp: string;
  continuationBuyerCount: number;
  pre3mFirstBuyers: number | null;
  continuationFirstBuyers: number | null;
  /** PONS market only. Omitted/null for POOLS — never a fake market. */
  displayMarketAddress?: string | null;
};
