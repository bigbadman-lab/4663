/**
 * Parallel POOLS Instant worker RAM.
 * Not ActiveTokenState — Instant has no PONS marketAddress / factoryVersion.
 */

import { isWithinContinuationWatch } from "@/lib/pons/continuation";
import type {
  Address,
  ChainUnixSeconds,
  RollingFirstBuyer,
  TxHash,
} from "@/lib/pons/types";
import type { LaunchedTokenCurrencyIndex } from "@/lib/pools/launch-discovery/types";
import type { PoolsInstantLaunchRow } from "@/lib/worker/repositories/pools-launches";
import type { FirstBuyerRow } from "@/lib/worker/db-types";
import {
  normalizeAddress,
  timestampToUnixSeconds,
} from "@/lib/worker/normalize";

export type PoolsWatchedLaunch = {
  tokenAddress: Address;
  poolId: string;
  launchedTokenCurrencyIndex: LaunchedTokenCurrencyIndex;
  sourceContract: Address;
  launchTxHash: TxHash;
  launchBlock: number;
  launchTimestamp: ChainUnixSeconds;
};

export type PoolsWorkerMemory = {
  watch: Map<Address, PoolsWatchedLaunch>;
  byPoolId: Map<string, Address>;
  confirmedBuyers: Map<Address, Set<Address>>;
  rollingFirstBuyers: Map<Address, RollingFirstBuyer[]>;
  continuationResolved: Set<Address>;
};

export function createPoolsWorkerMemory(): PoolsWorkerMemory {
  return {
    watch: new Map(),
    byPoolId: new Map(),
    confirmedBuyers: new Map(),
    rollingFirstBuyers: new Map(),
    continuationResolved: new Set(),
  };
}

function ensureBuyerMaps(memory: PoolsWorkerMemory, token: Address): void {
  if (!memory.confirmedBuyers.has(token)) {
    memory.confirmedBuyers.set(token, new Set());
  }
  if (!memory.rollingFirstBuyers.has(token)) {
    memory.rollingFirstBuyers.set(token, []);
  }
}

export function poolsLaunchToWatched(
  row: PoolsInstantLaunchRow,
): PoolsWatchedLaunch {
  return {
    tokenAddress: normalizeAddress(row.tokenAddress),
    poolId: row.poolId.trim().toLowerCase(),
    launchedTokenCurrencyIndex: row.launchedTokenCurrencyIndex,
    sourceContract: normalizeAddress(row.sourceContract),
    launchTxHash: row.launchTxHash,
    launchBlock: row.launchBlockNumber,
    launchTimestamp: timestampToUnixSeconds(row.launchBlockTimestamp),
  };
}

export function addPoolsLaunchToWatch(
  memory: PoolsWorkerMemory,
  launch: PoolsWatchedLaunch,
  evaluationUnix?: number,
): boolean {
  const token = normalizeAddress(launch.tokenAddress);
  if (memory.continuationResolved.has(token)) return false;
  if (
    evaluationUnix !== undefined &&
    !isWithinContinuationWatch(evaluationUnix, launch.launchTimestamp)
  ) {
    return false;
  }
  memory.watch.set(token, {
    ...launch,
    tokenAddress: token,
    poolId: launch.poolId.trim().toLowerCase(),
  });
  memory.byPoolId.set(launch.poolId.trim().toLowerCase(), token);
  ensureBuyerMaps(memory, token);
  return true;
}

export function removePoolsFromContinuationWatch(
  memory: PoolsWorkerMemory,
  tokenAddress: string,
  opts?: { markResolved?: boolean },
): void {
  const token = normalizeAddress(tokenAddress);
  const existing = memory.watch.get(token);
  memory.watch.delete(token);
  if (existing) memory.byPoolId.delete(existing.poolId);
  if (opts?.markResolved) memory.continuationResolved.add(token);
}

export function prunePoolsContinuationWatchByAge(
  memory: PoolsWorkerMemory,
  evaluationUnix: number,
): number {
  let removed = 0;
  for (const [addr, launch] of [...memory.watch.entries()]) {
    if (!isWithinContinuationWatch(evaluationUnix, launch.launchTimestamp)) {
      removePoolsFromContinuationWatch(memory, addr, { markResolved: true });
      removed += 1;
    }
  }
  return removed;
}

export function applyPoolsFirstBuyersToMemory(
  memory: PoolsWorkerMemory,
  firstBuyers: FirstBuyerRow[],
): void {
  const sorted = [...firstBuyers].sort((a, b) => {
    const ta = timestampToUnixSeconds(a.firstBuyBlockTimestamp);
    const tb = timestampToUnixSeconds(b.firstBuyBlockTimestamp);
    if (ta !== tb) return ta - tb;
    return a.walletAddress.localeCompare(b.walletAddress);
  });

  for (const buyer of sorted) {
    const tokenAddress = normalizeAddress(buyer.tokenAddress);
    if (!memory.watch.has(tokenAddress)) continue;
    addPoolsFirstBuyerToMemory(memory, {
      tokenAddress,
      walletAddress: buyer.walletAddress,
      firstBuyBlockTimestampUnix: timestampToUnixSeconds(
        buyer.firstBuyBlockTimestamp,
      ),
    });
  }
}

export function addPoolsFirstBuyerToMemory(
  memory: PoolsWorkerMemory,
  input: {
    tokenAddress: string;
    walletAddress: string;
    firstBuyBlockTimestampUnix: number;
  },
): void {
  const token = normalizeAddress(input.tokenAddress);
  const wallet = normalizeAddress(input.walletAddress);
  if (!memory.watch.has(token)) return;

  ensureBuyerMaps(memory, token);
  const set = memory.confirmedBuyers.get(token)!;
  if (set.has(wallet)) return;
  set.add(wallet);

  const rolling = memory.rollingFirstBuyers.get(token)!;
  rolling.push({
    walletAddress: wallet,
    firstBuyBlockTimestamp: input.firstBuyBlockTimestampUnix,
  });
  rolling.sort((a, b) => {
    if (a.firstBuyBlockTimestamp !== b.firstBuyBlockTimestamp) {
      return a.firstBuyBlockTimestamp - b.firstBuyBlockTimestamp;
    }
    return a.walletAddress.localeCompare(b.walletAddress);
  });
}

export function reconstructPoolsWorkerMemory(
  launches: PoolsInstantLaunchRow[],
  firstBuyers: FirstBuyerRow[],
  evaluationUnix: number,
  continuationEventTokens: Set<string>,
): PoolsWorkerMemory {
  const memory = createPoolsWorkerMemory();
  for (const addr of continuationEventTokens) {
    memory.continuationResolved.add(normalizeAddress(addr));
  }
  for (const launch of launches) {
    addPoolsLaunchToWatch(memory, poolsLaunchToWatched(launch), evaluationUnix);
  }
  applyPoolsFirstBuyersToMemory(memory, firstBuyers);
  return memory;
}
