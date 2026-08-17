/**
 * POOLS Instant activity scanner: PoolManager Swap logs for known Instant pools.
 * Isolated from PONS transfer scanning. Buyer = tx.from after a classified BUY.
 */

import {
  POOLS_V4_SWAP_TOPIC0,
  RHC_UNISWAP_V4_POOL_MANAGER,
} from "@/lib/pools/addresses";
import { isPoolsInstantBuySwap, poolsInstantBuyerFromTx } from "@/lib/pools/buy-adapter";
import { extractPoolsV4SwapsFromLogs } from "@/lib/pools/swap/decode";
import { isWithinContinuationWatch } from "@/lib/pons/continuation";
import type { ChainRpc } from "@/lib/worker/chain/rpc";
import {
  FACTORY_SCAN_INITIAL_CHUNK_BLOCKS,
  FACTORY_SCAN_MAX_CHUNK_BLOCKS,
  FACTORY_SCAN_MIN_CHUNK_BLOCKS,
  FACTORY_SCAN_RATE_LIMIT_RETRIES,
  FACTORY_SCAN_REQUEST_DELAY_MS,
} from "@/lib/worker/constants";
import { workerLog } from "@/lib/worker/log";
import {
  normalizeAddress,
  timestampToUnixSeconds,
} from "@/lib/worker/normalize";
import { tryFirePoolsBuyerContinuation } from "@/lib/worker/pools/continuation-eval";
import {
  addPoolsFirstBuyerToMemory,
  addPoolsLaunchToWatch,
  poolsLaunchToWatched,
  type PoolsWatchedLaunch,
  type PoolsWorkerMemory,
} from "@/lib/worker/pools/state";
import { insertPoolsFirstBuyerIdempotent } from "@/lib/worker/repositories/pools-first-buyers";
import { loadPoolsInstantLaunchByPoolId } from "@/lib/worker/repositories/pools-launches";
import type { WorkerSupabase } from "@/lib/worker/supabase";

export type PoolsSwapScanResult = {
  fromBlock: number;
  toBlock: number;
  rawLogs: number;
  decodedSwaps: number;
  unknownPools: number;
  sells: number;
  newFirstBuyers: number;
  alreadyKnownBuyers: number;
  fullyProcessed: boolean;
  failures: string[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimitError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("429") ||
    m.includes("too many requests") ||
    m.includes("rate limit") ||
    m.includes("compute units")
  );
}

function isRangeError(message: string): boolean {
  if (isRateLimitError(message)) return false;
  const m = message.toLowerCase();
  return (
    m.includes("block range") ||
    m.includes("block request") ||
    m.includes("free tier") ||
    m.includes("10 block") ||
    m.includes("response size") ||
    m.includes("too many results") ||
    m.includes("query returned more than") ||
    m.includes("-32005") ||
    m.includes("-32600") ||
    m.includes("-32602")
  );
}

function parseSuggestedMaxBlocks(message: string): number | null {
  const m =
    message.match(/up to a (\d+)\s*block/i) ??
    message.match(/maximum (?:of )?(\d+) blocks?/i);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function getLogsChunkWithRetry(
  rpc: ChainRpc,
  fromBlock: number,
  toBlock: number,
): Promise<Awaited<ReturnType<ChainRpc["getLogs"]>>> {
  let attempt = 0;
  for (;;) {
    try {
      if (FACTORY_SCAN_REQUEST_DELAY_MS > 0) {
        await sleep(FACTORY_SCAN_REQUEST_DELAY_MS);
      }
      return await rpc.getLogs({
        address: RHC_UNISWAP_V4_POOL_MANAGER,
        fromBlock,
        toBlock,
        topic0: POOLS_V4_SWAP_TOPIC0,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!isRateLimitError(msg) || attempt >= FACTORY_SCAN_RATE_LIMIT_RETRIES) {
        throw err;
      }
      await sleep(Math.min(30_000, 500 * 2 ** attempt));
      attempt += 1;
    }
  }
}

async function fetchSwapLogsAdaptive(
  rpc: ChainRpc,
  fromBlock: number,
  toBlock: number,
): Promise<Awaited<ReturnType<ChainRpc["getLogs"]>>> {
  const out: Awaited<ReturnType<ChainRpc["getLogs"]>> = [];
  let cursor = fromBlock;
  let chunkSize: number = FACTORY_SCAN_INITIAL_CHUNK_BLOCKS;
  let hardMax: number | null = null;

  while (cursor <= toBlock) {
    if (hardMax !== null && chunkSize > hardMax) chunkSize = hardMax;
    const end = Math.min(cursor + chunkSize - 1, toBlock);
    try {
      const logs = await getLogsChunkWithRetry(rpc, cursor, end);
      out.push(...logs);
      cursor = end + 1;
      if (chunkSize < FACTORY_SCAN_MAX_CHUNK_BLOCKS) {
        const cap = hardMax ?? FACTORY_SCAN_MAX_CHUNK_BLOCKS;
        chunkSize = Math.min(chunkSize * 2, cap);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isRateLimitError(msg)) throw err;
      if (!isRangeError(msg) || chunkSize <= FACTORY_SCAN_MIN_CHUNK_BLOCKS) {
        throw err;
      }
      const suggested = parseSuggestedMaxBlocks(msg);
      if (suggested !== null) hardMax = suggested;
      chunkSize =
        suggested !== null && suggested < chunkSize
          ? suggested
          : Math.max(
              FACTORY_SCAN_MIN_CHUNK_BLOCKS,
              Math.floor(chunkSize / 2),
            );
    }
  }
  return out;
}

export async function scanPoolsSwapRange(input: {
  rpc: ChainRpc;
  supabase: WorkerSupabase;
  chainId: number;
  memory: PoolsWorkerMemory;
  fromBlock: number;
  toBlock: number;
}): Promise<PoolsSwapScanResult> {
  const { rpc, supabase, chainId, memory, fromBlock, toBlock } = input;
  if (fromBlock > toBlock) {
    throw new Error(
      `[4663-worker] invalid pools swap scan range ${fromBlock}-${toBlock}`,
    );
  }

  const raw = await fetchSwapLogsAdaptive(rpc, fromBlock, toBlock);
  const { decoded, malformed } = extractPoolsV4SwapsFromLogs(raw);

  const failures: string[] = [];
  if (malformed > 0) {
    failures.push(`malformed PoolManager Swap logs: ${malformed}`);
  }

  const blockTsCache = new Map<number, number>();
  const getBlockTimestampUnix = async (blockNumber: number) => {
    const cached = blockTsCache.get(blockNumber);
    if (cached !== undefined) return cached;
    const block = await rpc.getBlock(blockNumber);
    blockTsCache.set(blockNumber, block.timestamp);
    return block.timestamp;
  };

  const unknownPoolCache = new Set<string>();

  async function resolveWatched(
    poolId: string,
    evaluationUnix: number,
  ): Promise<PoolsWatchedLaunch | null> {
    if (unknownPoolCache.has(poolId)) return null;
    const watchedToken = memory.byPoolId.get(poolId);
    if (watchedToken) {
      return memory.watch.get(watchedToken) ?? null;
    }

    const row = await loadPoolsInstantLaunchByPoolId(supabase, chainId, poolId);
    if (!row) {
      unknownPoolCache.add(poolId);
      return null;
    }
    addPoolsLaunchToWatch(memory, poolsLaunchToWatched(row), evaluationUnix);
    return memory.watch.get(normalizeAddress(row.tokenAddress)) ?? null;
  }

  let unknownPools = 0;
  let sells = 0;
  let newFirstBuyers = 0;
  let alreadyKnownBuyers = 0;

  decoded.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
    return a.logIndex - b.logIndex;
  });

  for (const swap of decoded) {
    try {
      const tsUnix = await getBlockTimestampUnix(swap.blockNumber);
      const watched = await resolveWatched(swap.poolId, tsUnix);
      if (!watched) {
        unknownPools += 1;
        continue;
      }
      if (memory.continuationResolved.has(watched.tokenAddress)) {
        continue;
      }
      if (!isWithinContinuationWatch(tsUnix, watched.launchTimestamp)) {
        continue;
      }

      const isBuy = isPoolsInstantBuySwap(
        {
          poolId: watched.poolId,
          launchedTokenAddress: watched.tokenAddress,
          launchedTokenCurrencyIndex: watched.launchedTokenCurrencyIndex,
        },
        { amount0: swap.amount0, amount1: swap.amount1 },
      );
      if (!isBuy) {
        sells += 1;
        continue;
      }

      const tx = await rpc.getTransaction(swap.txHash);
      const buyer = poolsInstantBuyerFromTx(tx.from);

      if (memory.confirmedBuyers.get(watched.tokenAddress)?.has(buyer)) {
        alreadyKnownBuyers += 1;
        continue;
      }

      const insert = await insertPoolsFirstBuyerIdempotent(supabase, {
        chainId,
        tokenAddress: watched.tokenAddress,
        walletAddress: buyer,
        firstBuyTxHash: swap.txHash,
        firstBuyBlockNumber: swap.blockNumber,
        firstBuyBlockTimestampIso: new Date(tsUnix * 1000).toISOString(),
      });

      if (insert.outcome === "inserted") {
        newFirstBuyers += 1;
        workerLog(
          `pools first buyer ${watched.tokenAddress.slice(0, 10)}… wallet=${buyer} block=${swap.blockNumber}`,
        );
      } else {
        alreadyKnownBuyers += 1;
      }

      const existingTs =
        insert.outcome === "already_exists"
          ? timestampToUnixSeconds(insert.row.firstBuyBlockTimestamp)
          : tsUnix;

      addPoolsFirstBuyerToMemory(memory, {
        tokenAddress: watched.tokenAddress,
        walletAddress: buyer,
        firstBuyBlockTimestampUnix: existingTs,
      });

      if (insert.outcome === "inserted") {
        const current = memory.watch.get(watched.tokenAddress);
        if (current) {
          await tryFirePoolsBuyerContinuation({
            supabase,
            chainId,
            memory,
            token: current,
            evaluationTimestampUnix: tsUnix,
            evaluationBlockNumber: swap.blockNumber,
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`swap ${swap.txHash}: ${msg}`);
      workerLog(`FAIL pools swap resolve/persist: ${msg}`);
      break;
    }
  }

  return {
    fromBlock,
    toBlock,
    rawLogs: raw.length,
    decodedSwaps: decoded.length,
    unknownPools,
    sells,
    newFirstBuyers,
    alreadyKnownBuyers,
    fullyProcessed: failures.length === 0,
    failures,
  };
}
