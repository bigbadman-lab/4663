/**
 * Resolve extracted factory launch candidates into durable launch records.
 */

import { CHAIN_ID } from "@/lib/pons/constants";
import type { ExtractedLaunchCandidate } from "@/lib/pons/launch-discovery/types";
import type {
  CodeLookup,
  ResolvedPonsLaunch,
  TransactionReceiptLike,
} from "@/lib/pons/launch-discovery/types";
import { resolveV1Market } from "@/lib/pons/launch-discovery/resolve-v1-market";
import { resolveV2Market } from "@/lib/pons/launch-discovery/resolve-v2-market";
import { normalizeAddress, normalizeTxHash } from "@/lib/worker/normalize";

export type ReceiptLookup = (
  txHash: string,
) => Promise<TransactionReceiptLike>;

export type BlockTimestampLookup = (blockNumber: number) => Promise<number>;

export class LaunchResolutionError extends Error {
  constructor(
    message: string,
    readonly candidate: ExtractedLaunchCandidate,
    readonly evidence: string[] = [],
  ) {
    super(message);
    this.name = "LaunchResolutionError";
  }
}

export async function resolveLaunchCandidate(
  candidate: ExtractedLaunchCandidate,
  deps: {
    getCode: CodeLookup;
    getReceipt: ReceiptLookup;
    getBlockTimestampUnix: BlockTimestampLookup;
  },
): Promise<ResolvedPonsLaunch> {
  let marketAddress: string | null = null;
  let evidence: string[] = [];

  if (candidate.factoryVersion === "v2") {
    const resolved = await resolveV2Market(
      candidate.marketFromTopics,
      deps.getCode,
    );
    marketAddress = resolved.market;
    evidence = resolved.evidence;
  } else {
    const receipt = await deps.getReceipt(candidate.launchTxHash);
    const resolved = await resolveV1Market(
      receipt,
      candidate.tokenAddress,
      deps.getCode,
    );
    marketAddress = resolved.market;
    evidence = resolved.evidence;
  }

  if (!marketAddress) {
    throw new LaunchResolutionError(
      `unresolved market for ${candidate.factoryVersion} launch ${candidate.launchTxHash}`,
      candidate,
      evidence,
    );
  }

  const launchBlockTimestampUnix = await deps.getBlockTimestampUnix(
    candidate.launchBlockNumber,
  );

  return {
    chainId: CHAIN_ID,
    factoryVersion: candidate.factoryVersion,
    factoryAddress: normalizeAddress(candidate.factoryAddress),
    tokenAddress: normalizeAddress(candidate.tokenAddress),
    marketAddress: normalizeAddress(marketAddress),
    launchTxHash: normalizeTxHash(candidate.launchTxHash),
    launchBlockNumber: candidate.launchBlockNumber,
    launchBlockTimestampUnix,
    launchBlockTimestampIso: new Date(
      launchBlockTimestampUnix * 1000,
    ).toISOString(),
  };
}
