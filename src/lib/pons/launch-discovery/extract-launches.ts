/**
 * Extract launch candidates from dual-factory eth_getLogs results.
 * Ported from pons-data-lab/src/probes/build-launch-registry.ts
 * function extractLaunchesFromLogs.
 */

import {
  V1_FACTORY_TOPIC0_A,
  V1_FACTORY_TOPIC0_B,
  V2_FACTORY_TOPIC0,
} from "@/lib/pons/addresses";
import type { PonsFactoryDefinition } from "@/lib/pons/factories";
import { factoryByAddress } from "@/lib/pons/factories";
import {
  isAddressShaped,
  topicToAddress,
} from "@/lib/pons/launch-discovery/topic-utils";
import type {
  ExtractedLaunchCandidate,
  FactoryLog,
} from "@/lib/pons/launch-discovery/types";
import { normalizeAddress, normalizeTxHash } from "@/lib/worker/normalize";

export function annotateFactoryLogs(
  rawLogs: Array<{
    address: string;
    blockNumber: bigint | number | null;
    transactionHash: string | null;
    logIndex: number | null;
    topics: readonly string[];
    data: string;
  }>,
  factories: readonly PonsFactoryDefinition[],
): FactoryLog[] {
  const out: FactoryLog[] = [];
  for (const log of rawLogs) {
    if (log.blockNumber === null || log.transactionHash === null) continue;
    const def = factoryByAddress(factories, log.address);
    if (!def) continue;
    out.push({
      address: def.address,
      factoryVersion: def.version,
      blockNumber: Number(log.blockNumber),
      transactionHash: normalizeTxHash(log.transactionHash),
      logIndex: Number(log.logIndex ?? 0),
      topics: [...log.topics],
      data: log.data,
    });
  }
  return out;
}

/**
 * One launch per (tx, token). Prefer first matching factory log.
 * Token always factory topics[1]. V2 market may be topics[2].
 */
export function extractLaunchesFromLogs(
  logs: FactoryLog[],
): ExtractedLaunchCandidate[] {
  const byTxToken = new Map<string, ExtractedLaunchCandidate>();

  for (const log of logs) {
    const t0 = log.topics[0];
    if (!t0) continue;
    const t1 = log.topics[1];
    if (!t1 || !isAddressShaped(t1)) continue;
    const token = topicToAddress(t1);
    const factoryAddress = normalizeAddress(log.address);

    if (log.factoryVersion === "v2") {
      if (t0.toLowerCase() !== V2_FACTORY_TOPIC0.toLowerCase()) continue;
      const t2 = log.topics[2];
      const market =
        t2 && isAddressShaped(t2) ? topicToAddress(t2) : null;
      const key = `v2:${log.transactionHash}:${token}`;
      if (!byTxToken.has(key)) {
        byTxToken.set(key, {
          factoryVersion: "v2",
          factoryAddress,
          launchBlockNumber: log.blockNumber,
          launchTxHash: log.transactionHash,
          tokenAddress: token,
          marketFromTopics: market,
          factoryTopic0: t0.toLowerCase(),
        });
      }
      continue;
    }

    // V1: either factory topic0; token always topics[1]
    if (
      t0.toLowerCase() !== V1_FACTORY_TOPIC0_A.toLowerCase() &&
      t0.toLowerCase() !== V1_FACTORY_TOPIC0_B.toLowerCase()
    ) {
      continue;
    }
    const key = `v1:${log.transactionHash}:${token}`;
    if (!byTxToken.has(key)) {
      byTxToken.set(key, {
        factoryVersion: "v1",
        factoryAddress,
        launchBlockNumber: log.blockNumber,
        launchTxHash: log.transactionHash,
        tokenAddress: token,
        marketFromTopics: null,
        factoryTopic0: t0.toLowerCase(),
      });
    }
  }

  return [...byTxToken.values()].sort((a, b) => {
    if (a.launchBlockNumber !== b.launchBlockNumber) {
      return a.launchBlockNumber - b.launchBlockNumber;
    }
    return a.launchTxHash.localeCompare(b.launchTxHash);
  });
}
