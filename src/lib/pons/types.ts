import {
  EVENT_SOURCE_PONS,
  EVENT_TYPE_PONS_BUYING_ACTIVITY,
  FACTORY_VERSIONS,
  LAUNCH_STATUSES,
} from "@/lib/pons/constants";

/** Stage 1 pons_launches.status */
export type LaunchStatus = (typeof LAUNCH_STATUSES)[number];

export type FactoryVersion = (typeof FACTORY_VERSIONS)[number];

export type CursorStreamName = "pons_factories" | "pons_transfers";

export type PonsBuyingEventType = typeof EVENT_TYPE_PONS_BUYING_ACTIVITY;
export type PonsEventSource = typeof EVENT_SOURCE_PONS;

/** Unix seconds derived from chain block timestamps (UTC). */
export type ChainUnixSeconds = number;

export type Address = string;
export type TxHash = string;

/**
 * In-memory ACTIVE token cache (reconstructible from pons_launches).
 * Not durable by itself.
 */
export type ActiveTokenState = {
  tokenAddress: Address;
  marketAddress: Address;
  factoryAddress: Address;
  factoryVersion: FactoryVersion;
  launchTxHash: TxHash;
  launchBlock: number;
  /** Launch block timestamp as unix seconds (UTC, chain authority). */
  launchTimestamp: ChainUnixSeconds;
};

/**
 * Ordered rolling first-buyer entry (chain timestamps only).
 * Wallet is first confirmed once; repeats never re-enter.
 */
export type RollingFirstBuyer = {
  walletAddress: Address;
  firstBuyBlockTimestamp: ChainUnixSeconds;
};

/**
 * Conceptual worker RAM layout for MVP strict watch.
 * Supabase remains authoritative.
 */
export type WorkerMemoryModel = {
  activeTokens: Map<Address, ActiveTokenState>;
  confirmedBuyers: Map<Address, Set<Address>>;
  rollingFirstBuyers: Map<Address, RollingFirstBuyer[]>;
};

/**
 * Inclusive rolling window membership:
 *   T - windowSeconds <= t_i <= T
 */
export type WindowParams = {
  /** Current relevant chain timestamp (unix seconds). */
  chainTimestamp: ChainUnixSeconds;
  windowSeconds: number;
};

/**
 * Fire evaluation inputs (pure domain; no I/O).
 */
export type FireEligibilityInput = {
  launchTimestamp: ChainUnixSeconds;
  chainTimestamp: ChainUnixSeconds;
  rollingFirstBuyerTimestamps: ChainUnixSeconds[];
  ageFloorSeconds: number;
  windowSeconds: number;
  threshold: number;
  watchTtlSeconds: number;
};
