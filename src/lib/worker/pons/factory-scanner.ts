/**
 * Dual-factory PONS launch scanner for a closed block range.
 * eth_getLogs uses both factory addresses in one request (per chunk).
 */

import type { PonsFactoryDefinition } from "@/lib/pons/factories";
import { isProductionEligibleLaunchBlock } from "@/lib/pons/production-boundary";
import {
  annotateFactoryLogs,
  extractLaunchesFromLogs,
  LaunchResolutionError,
  resolveLaunchCandidate,
  type ResolvedPonsLaunch,
} from "@/lib/pons/launch-discovery";
import type { ChainRpc } from "@/lib/worker/chain/rpc";
import {
  FACTORY_SCAN_INITIAL_CHUNK_BLOCKS,
  FACTORY_SCAN_MAX_CHUNK_BLOCKS,
  FACTORY_SCAN_MIN_CHUNK_BLOCKS,
  FACTORY_SCAN_RATE_LIMIT_RETRIES,
  FACTORY_SCAN_REQUEST_DELAY_MS,
} from "@/lib/worker/constants";
import {
  insertLaunchIdempotent,
  type InsertLaunchResult,
} from "@/lib/worker/repositories/launches";
import type { WorkerSupabase } from "@/lib/worker/supabase";
import { workerLog } from "@/lib/worker/log";

export type FactoryScanResult = {
  fromBlock: number;
  toBlock: number;
  rawLogs: number;
  candidates: number;
  discovered: ResolvedPonsLaunch[];
  inserted: number;
  alreadyKnown: number;
  skippedPreBoundary: number;
  /** true only if every required launch resolved and persisted (or known) */
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
  addresses: string[],
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
        address: addresses,
        fromBlock,
        toBlock,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!isRateLimitError(msg) || attempt >= FACTORY_SCAN_RATE_LIMIT_RETRIES) {
        throw err;
      }
      const backoff = Math.min(30_000, 500 * 2 ** attempt);
      await sleep(backoff);
      attempt += 1;
    }
  }
}

async function fetchFactoryLogsAdaptive(
  rpc: ChainRpc,
  addresses: string[],
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
      const logs = await getLogsChunkWithRetry(rpc, addresses, cursor, end);
      out.push(...logs);
      cursor = end + 1;
      if (chunkSize < FACTORY_SCAN_MAX_CHUNK_BLOCKS) {
        const cap = hardMax ?? FACTORY_SCAN_MAX_CHUNK_BLOCKS;
        chunkSize = Math.min(chunkSize * 2, cap);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isRateLimitError(msg)) {
        throw err;
      }
      if (!isRangeError(msg) || chunkSize <= FACTORY_SCAN_MIN_CHUNK_BLOCKS) {
        throw err;
      }
      const suggested = parseSuggestedMaxBlocks(msg);
      if (suggested !== null) hardMax = suggested;
      const next =
        suggested !== null && suggested < chunkSize
          ? suggested
          : Math.max(
              FACTORY_SCAN_MIN_CHUNK_BLOCKS,
              Math.floor(chunkSize / 2),
            );
      chunkSize = next;
    }
  }

  return out;
}

/**
 * Scan [fromBlock, toBlock] inclusive for launches; persist idempotently.
 * Does NOT advance cursors — caller owns cursor progression after full success.
 *
 * After cutover, set productionStartBlock so launch_block ≤ B are not inserted
 * (startup rewind may re-read logs ≤ B without polluting production ACTIVE watch).
 */
export async function scanFactoryRange(input: {
  rpc: ChainRpc;
  supabase: WorkerSupabase;
  factories: readonly PonsFactoryDefinition[];
  fromBlock: number;
  toBlock: number;
  /** Last pre-production block B; skip insert when launch_block ≤ B */
  productionStartBlock?: number;
  /** Optional: called after each newly inserted launch */
  onInserted?: (launch: ResolvedPonsLaunch) => void;
}): Promise<FactoryScanResult> {
  const { rpc, supabase, factories, fromBlock, toBlock } = input;
  if (fromBlock > toBlock) {
    throw new Error(
      `[4663-worker] invalid factory scan range ${fromBlock}-${toBlock}`,
    );
  }

  const addresses = factories.map((f) => f.address);
  const raw = await fetchFactoryLogsAdaptive(
    rpc,
    addresses,
    fromBlock,
    toBlock,
  );
  const annotated = annotateFactoryLogs(raw, factories);
  const candidates = extractLaunchesFromLogs(annotated);

  const blockTsCache = new Map<number, number>();
  const getBlockTimestampUnix = async (blockNumber: number) => {
    const cached = blockTsCache.get(blockNumber);
    if (cached !== undefined) return cached;
    const block = await rpc.getBlock(blockNumber);
    blockTsCache.set(blockNumber, block.timestamp);
    return block.timestamp;
  };

  const getCode = async (address: string) => rpc.getCode(address);
  const getReceipt = async (txHash: string) => {
    const receipt = await rpc.getTransactionReceipt(txHash);
    return {
      transactionHash: receipt.transactionHash,
      logs: receipt.logs.map((l) => ({
        address: l.address,
        topics: [...l.topics],
        data: l.data,
      })),
    };
  };

  const discovered: ResolvedPonsLaunch[] = [];
  const failures: string[] = [];
  let inserted = 0;
  let alreadyKnown = 0;
  let skippedPreBoundary = 0;

  for (const candidate of candidates) {
    try {
      const resolved = await resolveLaunchCandidate(candidate, {
        getCode,
        getReceipt,
        getBlockTimestampUnix,
      });
      discovered.push(resolved);

      if (
        input.productionStartBlock !== undefined &&
        !isProductionEligibleLaunchBlock(
          resolved.launchBlockNumber,
          input.productionStartBlock,
        )
      ) {
        skippedPreBoundary += 1;
        workerLog(
          `skip pre-boundary launch block=${resolved.launchBlockNumber} (B=${input.productionStartBlock}) token=${resolved.tokenAddress}`,
        );
        continue;
      }

      const result: InsertLaunchResult = await insertLaunchIdempotent(
        supabase,
        resolved,
      );
      if (result.outcome === "inserted") {
        inserted += 1;
        input.onInserted?.(resolved);
        workerLog(
          `launch inserted ${resolved.factoryVersion} token=${resolved.tokenAddress} block=${resolved.launchBlockNumber}`,
        );
      } else {
        alreadyKnown += 1;
        if (result.preservedStatus !== "active") {
          workerLog(
            `launch already terminal (${result.preservedStatus}) token=${resolved.tokenAddress} — not rewritten`,
          );
        }
      }
    } catch (err) {
      if (err instanceof LaunchResolutionError) {
        const detail = err.evidence.join("; ");
        const msg = `unresolved launch ${err.candidate.factoryVersion} tx=${err.candidate.launchTxHash} block=${err.candidate.launchBlockNumber}: ${err.message}${detail ? ` | ${detail}` : ""}`;
        failures.push(msg);
        workerLog(`FAIL ${msg}`);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        failures.push(msg);
        workerLog(`FAIL resolve/persist: ${msg}`);
      }
    }
  }

  const fullyProcessed = failures.length === 0;

  return {
    fromBlock,
    toBlock,
    rawLogs: annotated.length,
    candidates: candidates.length,
    discovered,
    inserted,
    alreadyKnown,
    skippedPreBoundary,
    fullyProcessed,
    failures,
  };
}
