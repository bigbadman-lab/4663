import type {
  ActiveTokenState,
  Address,
  WorkerMemoryModel,
} from "@/lib/pons/types";
import { isProductionEligibleLaunchBlock } from "@/lib/pons/production-boundary";
import { isWithinContinuationWatch } from "@/lib/pons/continuation";
import type { ActiveLaunchRow, FirstBuyerRow } from "@/lib/worker/db-types";
import {
  normalizeAddress,
  timestampToUnixSeconds,
} from "@/lib/worker/normalize";

function emptyMemory(): WorkerMemoryModel {
  return {
    activeTokens: new Map(),
    continuationWatch: new Map(),
    continuationResolved: new Set(),
    confirmedBuyers: new Map(),
    rollingFirstBuyers: new Map(),
  };
}

function ensureBuyerMaps(memory: WorkerMemoryModel, tokenAddress: Address): void {
  if (!memory.confirmedBuyers.has(tokenAddress)) {
    memory.confirmedBuyers.set(tokenAddress, new Set());
  }
  if (!memory.rollingFirstBuyers.has(tokenAddress)) {
    memory.rollingFirstBuyers.set(tokenAddress, []);
  }
}

function launchToActiveState(launch: ActiveLaunchRow): ActiveTokenState {
  return {
    tokenAddress: normalizeAddress(launch.tokenAddress),
    marketAddress: normalizeAddress(launch.marketAddress),
    factoryAddress: normalizeAddress(launch.factoryAddress),
    factoryVersion: launch.factoryVersion,
    launchTxHash: launch.launchTxHash,
    launchBlock: launch.launchBlockNumber,
    launchTimestamp: timestampToUnixSeconds(launch.launchBlockTimestamp),
  };
}

/**
 * Reconstruct Stage 2 in-memory state from durable ACTIVE launches + buyers.
 * Callers must pass only production-eligible ACTIVE launches after cutover.
 * Does NOT prune by wall clock — chain-time pruning happens later with real chain progress.
 */
export function reconstructWorkerMemory(
  launches: ActiveLaunchRow[],
  firstBuyers: FirstBuyerRow[],
): WorkerMemoryModel {
  const memory = emptyMemory();

  for (const launch of launches) {
    if (launch.status !== "active") continue;

    const tokenAddress = normalizeAddress(launch.tokenAddress);
    memory.activeTokens.set(tokenAddress, launchToActiveState(launch));
    ensureBuyerMaps(memory, tokenAddress);
  }

  applyFirstBuyersToMemory(memory, firstBuyers);
  return memory;
}

/**
 * Merge fired (or active) launches still under continuation age into
 * continuationWatch. Skips tokens already ACTIVE or continuation-resolved.
 * Does not add buyers — call applyFirstBuyersToMemory separately.
 */
export function addContinuationWatchLaunches(
  memory: WorkerMemoryModel,
  launches: ActiveLaunchRow[],
  evaluationUnix: number,
  opts?: {
    /** Token addresses that already have pons_buyer_continuation. */
    continuationEventTokenAddresses?: ReadonlySet<string>;
  },
): number {
  const alreadyContinued = opts?.continuationEventTokenAddresses;
  let added = 0;

  for (const launch of launches) {
    const tokenAddress = normalizeAddress(launch.tokenAddress);
    if (memory.activeTokens.has(tokenAddress)) continue;
    if (memory.continuationWatch.has(tokenAddress)) continue;
    if (memory.continuationResolved.has(tokenAddress)) continue;
    if (alreadyContinued?.has(tokenAddress)) {
      memory.continuationResolved.add(tokenAddress);
      continue;
    }

    const state = launchToActiveState(launch);
    if (!isWithinContinuationWatch(evaluationUnix, state.launchTimestamp)) {
      continue;
    }

    memory.continuationWatch.set(tokenAddress, state);
    ensureBuyerMaps(memory, tokenAddress);
    added += 1;
  }

  return added;
}

export function applyFirstBuyersToMemory(
  memory: WorkerMemoryModel,
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
    if (
      !memory.activeTokens.has(tokenAddress) &&
      !memory.continuationWatch.has(tokenAddress)
    ) {
      continue;
    }

    const wallet = normalizeAddress(buyer.walletAddress);
    ensureBuyerMaps(memory, tokenAddress);
    const set = memory.confirmedBuyers.get(tokenAddress)!;
    if (set.has(wallet)) continue;
    set.add(wallet);

    memory.rollingFirstBuyers.get(tokenAddress)!.push({
      walletAddress: wallet,
      firstBuyBlockTimestamp: timestampToUnixSeconds(
        buyer.firstBuyBlockTimestamp,
      ),
    });
  }
}

export function activeTokenCount(memory: WorkerMemoryModel): number {
  return memory.activeTokens.size;
}

export function continuationWatchCount(memory: WorkerMemoryModel): number {
  return memory.continuationWatch.size;
}

/** Tokens that need Transfer / first-buyer scanning. */
export function watchedTokensForScan(
  memory: WorkerMemoryModel,
): ActiveTokenState[] {
  const out: ActiveTokenState[] = [];
  const seen = new Set<string>();
  for (const t of memory.activeTokens.values()) {
    seen.add(t.tokenAddress);
    out.push(t);
  }
  for (const t of memory.continuationWatch.values()) {
    if (seen.has(t.tokenAddress)) continue;
    out.push(t);
  }
  return out;
}

export function getWatchedToken(
  memory: WorkerMemoryModel,
  tokenAddress: string,
): ActiveTokenState | undefined {
  const token = normalizeAddress(tokenAddress);
  return (
    memory.activeTokens.get(token) ?? memory.continuationWatch.get(token)
  );
}

/**
 * After burst fire: leave ACTIVE burst path; keep observation on continuation
 * watch while age < 300.
 */
export function moveActiveToContinuationWatch(
  memory: WorkerMemoryModel,
  tokenAddress: string,
  evaluationUnix: number,
): void {
  const token = normalizeAddress(tokenAddress);
  const state = memory.activeTokens.get(token);
  if (!state) return;

  memory.activeTokens.delete(token);

  if (
    memory.continuationResolved.has(token) ||
    !isWithinContinuationWatch(evaluationUnix, state.launchTimestamp)
  ) {
    // Past continuation window — drop buyer maps if unused elsewhere.
    if (!memory.continuationWatch.has(token)) {
      memory.confirmedBuyers.delete(token);
      memory.rollingFirstBuyers.delete(token);
    }
    return;
  }

  memory.continuationWatch.set(token, state);
  ensureBuyerMaps(memory, token);
}

export function removeFromContinuationWatch(
  memory: WorkerMemoryModel,
  tokenAddress: string,
  opts?: { markResolved?: boolean },
): void {
  const token = normalizeAddress(tokenAddress);
  memory.continuationWatch.delete(token);
  if (opts?.markResolved !== false) {
    memory.continuationResolved.add(token);
  }
  if (!memory.activeTokens.has(token)) {
    memory.confirmedBuyers.delete(token);
    memory.rollingFirstBuyers.delete(token);
  }
}

/**
 * Inject a newly persisted ACTIVE launch into runtime RAM.
 * No-op when production boundary is set and launch_block ≤ B.
 */
export function addActiveLaunchToMemory(
  memory: WorkerMemoryModel,
  launch: {
    tokenAddress: string;
    marketAddress: string;
    factoryAddress: string;
    factoryVersion: ActiveTokenState["factoryVersion"];
    launchTxHash: string;
    launchBlockNumber: number;
    launchBlockTimestampIso: string;
  },
  opts?: { productionStartBlock?: number },
): void {
  if (
    opts?.productionStartBlock !== undefined &&
    !isProductionEligibleLaunchBlock(
      launch.launchBlockNumber,
      opts.productionStartBlock,
    )
  ) {
    return;
  }

  const tokenAddress = normalizeAddress(launch.tokenAddress);
  if (memory.activeTokens.has(tokenAddress)) return;
  // If somehow on continuation watch, prefer ACTIVE for burst path.
  memory.continuationWatch.delete(tokenAddress);

  memory.activeTokens.set(tokenAddress, {
    tokenAddress,
    marketAddress: normalizeAddress(launch.marketAddress),
    factoryAddress: normalizeAddress(launch.factoryAddress),
    factoryVersion: launch.factoryVersion,
    launchTxHash: launch.launchTxHash,
    launchBlock: launch.launchBlockNumber,
    launchTimestamp: timestampToUnixSeconds(launch.launchBlockTimestampIso),
  });
  ensureBuyerMaps(memory, tokenAddress);
}

/**
 * After durable first-buyer insert, update RAM.
 * Applies to ACTIVE and continuation-watch tokens.
 */
export function addFirstBuyerToMemory(
  memory: WorkerMemoryModel,
  input: {
    tokenAddress: string;
    walletAddress: string;
    firstBuyBlockTimestampUnix: number;
  },
): void {
  const token = normalizeAddress(input.tokenAddress);
  const wallet = normalizeAddress(input.walletAddress);

  if (
    !memory.activeTokens.has(token) &&
    !memory.continuationWatch.has(token)
  ) {
    return;
  }

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
