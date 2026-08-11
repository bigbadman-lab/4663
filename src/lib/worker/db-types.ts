import type {
  CursorStreamName,
  FactoryVersion,
  LaunchStatus,
} from "@/lib/pons/types";

/** Durable chain_cursors row (subset used by Stage 3). */
export type CursorRow = {
  streamName: CursorStreamName;
  chainId: number;
  lastProcessedBlock: number;
};

/** Durable ACTIVE pons_launches row mapped for reconstruction. */
export type ActiveLaunchRow = {
  chainId: number;
  tokenAddress: string;
  marketAddress: string;
  factoryAddress: string;
  factoryVersion: FactoryVersion;
  launchTxHash: string;
  launchBlockNumber: number;
  /** ISO timestamptz from Postgres */
  launchBlockTimestamp: string;
  status: LaunchStatus;
};

/** Durable pons_first_buyers row mapped for reconstruction. */
export type FirstBuyerRow = {
  chainId: number;
  tokenAddress: string;
  walletAddress: string;
  firstBuyTxHash: string;
  firstBuyBlockNumber: number;
  /** ISO timestamptz from Postgres */
  firstBuyBlockTimestamp: string;
};

export type WorkerHealthUpsert = {
  workerName: string;
  lastHeartbeatAt: string;
  latestChainBlock: number | null;
  latestProcessedBlock: number | null;
  activeTokens: number;
};
