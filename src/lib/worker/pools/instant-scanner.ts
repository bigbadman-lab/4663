/**
 * POOLS InstantLaunchStrategy scanner for a closed block range.
 * Isolated from PONS discovery/activity scanners. Discovery only.
 */

import {
  POOLS_INSTANT_STRATEGY_V3_2_0,
  POOLS_TOKEN_LAUNCHED_TOPIC0,
} from "@/lib/pools/addresses";
import { extractPoolsInstantLaunchesFromLogs } from "@/lib/pools/launch-discovery/decode";
import type { ResolvedPoolsInstantLaunch } from "@/lib/pools/launch-discovery/types";
import { isForwardWatchEligibleLaunchBlock } from "@/lib/pons/production-boundary";
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
  insertPoolsInstantLaunchIdempotent,
  resolveExtractedPoolsInstantLaunch,
  type InsertPoolsInstantLaunchResult,
  type PoolsInstantLaunchRow,
} from "@/lib/worker/repositories/pools-launches";
import type { WorkerSupabase } from "@/lib/worker/supabase";

export type PoolsInstantScanResult = {
  fromBlock: number;
  toBlock: number;
  rawLogs: number;
  candidates: number;
  discovered: ResolvedPoolsInstantLaunch[];
  inserted: number;
  alreadyKnown: number;
  skippedPreBoundary: number;
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
        address: POOLS_INSTANT_STRATEGY_V3_2_0,
        fromBlock,
        toBlock,
        topic0: POOLS_TOKEN_LAUNCHED_TOPIC0,
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

async function fetchInstantLogsAdaptive(
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

export async function scanPoolsInstantRange(input: {
  rpc: ChainRpc;
  supabase: WorkerSupabase;
  fromBlock: number;
  toBlock: number;
  productionStartBlock?: number;
  observationStartBlock?: number | null;
  onPersisted?: (row: PoolsInstantLaunchRow) => void;
}): Promise<PoolsInstantScanResult> {
  const { rpc, supabase, fromBlock, toBlock } = input;
  if (fromBlock > toBlock) {
    throw new Error(
      `[4663-worker] invalid pools instant scan range ${fromBlock}-${toBlock}`,
    );
  }

  const raw = await fetchInstantLogsAdaptive(rpc, fromBlock, toBlock);
  const candidates = extractPoolsInstantLaunchesFromLogs(raw);

  const blockTsCache = new Map<number, number>();
  const getBlockTimestampUnix = async (blockNumber: number) => {
    const cached = blockTsCache.get(blockNumber);
    if (cached !== undefined) return cached;
    const block = await rpc.getBlock(blockNumber);
    blockTsCache.set(blockNumber, block.timestamp);
    return block.timestamp;
  };

  const discovered: ResolvedPoolsInstantLaunch[] = [];
  const failures: string[] = [];
  let inserted = 0;
  let alreadyKnown = 0;
  let skippedPreBoundary = 0;

  for (const candidate of candidates) {
    try {
      const tsUnix = await getBlockTimestampUnix(candidate.launchBlockNumber);
      const resolved = resolveExtractedPoolsInstantLaunch(candidate, tsUnix);
      discovered.push(resolved);

      if (
        input.productionStartBlock !== undefined &&
        !isForwardWatchEligibleLaunchBlock(resolved.launchBlockNumber, {
          productionStartBlock: input.productionStartBlock,
          observationStartBlock: input.observationStartBlock ?? null,
        })
      ) {
        skippedPreBoundary += 1;
        continue;
      }

      const result: InsertPoolsInstantLaunchResult =
        await insertPoolsInstantLaunchIdempotent(supabase, resolved);
      if (result.outcome === "inserted") {
        inserted += 1;
        workerLog(
          `pools instant launch inserted token=${resolved.tokenAddress} block=${resolved.launchBlockNumber}`,
        );
      } else {
        alreadyKnown += 1;
      }
      input.onPersisted?.(result.row);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(msg);
      workerLog(`FAIL pools instant resolve/persist: ${msg}`);
    }
  }

  return {
    fromBlock,
    toBlock,
    rawLogs: raw.length,
    candidates: candidates.length,
    discovered,
    inserted,
    alreadyKnown,
    skippedPreBoundary,
    fullyProcessed: failures.length === 0,
    failures,
  };
}
