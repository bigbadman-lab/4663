import type { FactoryVersion } from "@/lib/pons/types";
import type { Address, TxHash } from "@/lib/pons/types";

/** Raw factory log as returned by getLogs (dual-factory). */
export type FactoryLog = {
  address: Address;
  factoryVersion: FactoryVersion;
  blockNumber: number;
  transactionHash: TxHash;
  logIndex: number;
  topics: string[];
  data: string;
};

/** Candidate launch extracted from factory logs (token always topics[1]). */
export type ExtractedLaunchCandidate = {
  factoryVersion: FactoryVersion;
  factoryAddress: Address;
  launchBlockNumber: number;
  launchTxHash: TxHash;
  tokenAddress: Address;
  /** V2 only: market from topics[2] when address-shaped. */
  marketFromTopics: Address | null;
  factoryTopic0: string;
};

/** Fully resolved launch ready for pons_launches insert. */
export type ResolvedPonsLaunch = {
  chainId: number;
  factoryVersion: FactoryVersion;
  factoryAddress: Address;
  tokenAddress: Address;
  marketAddress: Address;
  launchTxHash: TxHash;
  launchBlockNumber: number;
  /** ISO timestamptz derived from block.timestamp (chain authority). */
  launchBlockTimestampIso: string;
  /** Unix seconds from block.timestamp */
  launchBlockTimestampUnix: number;
};

export type ReceiptLog = {
  address: string;
  topics: string[];
  data: string;
};

export type TransactionReceiptLike = {
  transactionHash: string;
  logs: ReceiptLog[];
};

export type CodeLookup = (address: string) => Promise<string | null>;
