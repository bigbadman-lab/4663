import type {
  ActiveTokenState,
  Address,
  WorkerMemoryModel,
} from "@/lib/pons/types";
import type { ActiveLaunchRow, FirstBuyerRow } from "@/lib/worker/db-types";
import {
  normalizeAddress,
  timestampToUnixSeconds,
} from "@/lib/worker/normalize";

/**
 * Reconstruct Stage 2 in-memory state from durable ACTIVE launches + buyers.
 * Does NOT prune by wall clock — chain-time pruning happens later with real chain progress.
 */
export function reconstructWorkerMemory(
  launches: ActiveLaunchRow[],
  firstBuyers: FirstBuyerRow[],
): WorkerMemoryModel {
  const activeTokens = new Map<Address, ActiveTokenState>();
  const confirmedBuyers = new Map<Address, Set<Address>>();
  const rollingFirstBuyers = new Map<
    Address,
    { walletAddress: Address; firstBuyBlockTimestamp: number }[]
  >();

  for (const launch of launches) {
    if (launch.status !== "active") continue;

    const tokenAddress = normalizeAddress(launch.tokenAddress);
    activeTokens.set(tokenAddress, {
      tokenAddress,
      marketAddress: normalizeAddress(launch.marketAddress),
      factoryAddress: normalizeAddress(launch.factoryAddress),
      factoryVersion: launch.factoryVersion,
      launchTxHash: launch.launchTxHash,
      launchBlock: launch.launchBlockNumber,
      launchTimestamp: timestampToUnixSeconds(launch.launchBlockTimestamp),
    });
    confirmedBuyers.set(tokenAddress, new Set());
    rollingFirstBuyers.set(tokenAddress, []);
  }

  // Sort buyers by chain timestamp ascending for queue order.
  const sorted = [...firstBuyers].sort((a, b) => {
    const ta = timestampToUnixSeconds(a.firstBuyBlockTimestamp);
    const tb = timestampToUnixSeconds(b.firstBuyBlockTimestamp);
    if (ta !== tb) return ta - tb;
    return a.walletAddress.localeCompare(b.walletAddress);
  });

  for (const buyer of sorted) {
    const tokenAddress = normalizeAddress(buyer.tokenAddress);
    if (!activeTokens.has(tokenAddress)) {
      // Buyers for non-active tokens are ignored during reconstruction.
      continue;
    }

    const wallet = normalizeAddress(buyer.walletAddress);
    const set = confirmedBuyers.get(tokenAddress)!;
    if (set.has(wallet)) {
      // Durable unique should prevent this; Set stays idempotent.
      continue;
    }
    set.add(wallet);

    rollingFirstBuyers.get(tokenAddress)!.push({
      walletAddress: wallet,
      firstBuyBlockTimestamp: timestampToUnixSeconds(
        buyer.firstBuyBlockTimestamp,
      ),
    });
  }

  return {
    activeTokens,
    confirmedBuyers,
    rollingFirstBuyers,
  };
}

export function activeTokenCount(memory: WorkerMemoryModel): number {
  return memory.activeTokens.size;
}

/** Inject a newly persisted ACTIVE launch into runtime RAM (Stage 4 option A). */
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
): void {
  const tokenAddress = normalizeAddress(launch.tokenAddress);
  if (memory.activeTokens.has(tokenAddress)) return;

  memory.activeTokens.set(tokenAddress, {
    tokenAddress,
    marketAddress: normalizeAddress(launch.marketAddress),
    factoryAddress: normalizeAddress(launch.factoryAddress),
    factoryVersion: launch.factoryVersion,
    launchTxHash: launch.launchTxHash,
    launchBlock: launch.launchBlockNumber,
    launchTimestamp: timestampToUnixSeconds(launch.launchBlockTimestampIso),
  });
  memory.confirmedBuyers.set(tokenAddress, new Set());
  memory.rollingFirstBuyers.set(tokenAddress, []);
}

/**
 * After durable first-buyer insert, update RAM.
 * Lifecycle evaluation runs after transfer range commit (chain-time prune + fire).
 * Does not wall-clock prune the rolling queue.
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

  if (!memory.activeTokens.has(token)) return;

  let set = memory.confirmedBuyers.get(token);
  if (!set) {
    set = new Set();
    memory.confirmedBuyers.set(token, set);
  }
  if (set.has(wallet)) return;
  set.add(wallet);

  let rolling = memory.rollingFirstBuyers.get(token);
  if (!rolling) {
    rolling = [];
    memory.rollingFirstBuyers.set(token, rolling);
  }
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
