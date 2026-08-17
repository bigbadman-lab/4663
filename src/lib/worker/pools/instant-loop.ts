/**
 * Catch-up / continuous pools_instant cursor progression.
 * Independent Instant discovery stream. Isolated from PONS catch-up.
 */

import { CURSOR_STREAM_POOLS_INSTANT } from "@/lib/pools/constants";
import type { ResolvedPoolsInstantLaunch } from "@/lib/pools/launch-discovery/types";
import type { ChainRpc } from "@/lib/worker/chain/rpc";
import { FACTORY_SCAN_MAX_CHUNK_BLOCKS } from "@/lib/worker/constants";
import { prepareStartupCursors } from "@/lib/worker/cursor-runtime";
import { workerLog } from "@/lib/worker/log";
import { scanPoolsInstantRange } from "@/lib/worker/pools/instant-scanner";
import { loadCursor, upsertCursor } from "@/lib/worker/repositories/cursors";
import type { PoolsInstantLaunchRow } from "@/lib/worker/repositories/pools-launches";
import type { WorkerSupabase } from "@/lib/worker/supabase";

export type PoolsInstantCatchUpResult = {
  head: number;
  lastProcessedBlock: number | null;
  rangesScanned: number;
  inserted: number;
  alreadyKnown: number;
  advanced: boolean;
  blocked: boolean;
  launches: ResolvedPoolsInstantLaunch[];
};

export async function catchUpPoolsInstantCursor(input: {
  rpc: ChainRpc;
  supabase: WorkerSupabase;
  chainId: number;
  startupRewind: boolean;
  maxOuterRangeBlocks?: number;
  maxRanges?: number;
  /**
   * Stop once durable Instant cursor is >= this block (inclusive).
   * Used so POOLS swap scan can force Instant discovery through the swap range end.
   */
  targetThroughBlock?: number;
  productionStartBlock?: number;
  observationStartBlock?: number | null;
  onPersisted?: (row: PoolsInstantLaunchRow) => void;
}): Promise<PoolsInstantCatchUpResult> {
  const head = await input.rpc.getBlockNumber();
  const cursor = await loadCursor(
    input.supabase,
    CURSOR_STREAM_POOLS_INSTANT,
    input.chainId,
  );

  if (!cursor) {
    workerLog(
      "pools_instant cursor missing — Instant discovery idle until bootstrap",
    );
    return {
      head,
      lastProcessedBlock: null,
      rangesScanned: 0,
      inserted: 0,
      alreadyKnown: 0,
      advanced: false,
      blocked: false,
      launches: [],
    };
  }

  let from: number;
  if (input.startupRewind) {
    const plan = prepareStartupCursors(
      new Map([[CURSOR_STREAM_POOLS_INSTANT, cursor]]),
    )[0]!;
    from = plan.startupFromBlock;
    workerLog(
      `pools instant startup resume from ${from} (durable N=${cursor.lastProcessedBlock}, rewind in memory only)`,
    );
  } else {
    from = cursor.lastProcessedBlock + 1;
  }

  if (from > head) {
    return {
      head,
      lastProcessedBlock: cursor.lastProcessedBlock,
      rangesScanned: 0,
      inserted: 0,
      alreadyKnown: 0,
      advanced: false,
      blocked: false,
      launches: [],
    };
  }

  const outer = input.maxOuterRangeBlocks ?? FACTORY_SCAN_MAX_CHUNK_BLOCKS;
  let durableN = cursor.lastProcessedBlock;
  let rangesScanned = 0;
  let inserted = 0;
  let alreadyKnown = 0;
  let advanced = false;
  const launches: ResolvedPoolsInstantLaunch[] = [];
  let next = from;
  const upper =
    input.targetThroughBlock !== undefined
      ? Math.min(head, input.targetThroughBlock)
      : head;

  if (from > upper) {
    return {
      head,
      lastProcessedBlock: cursor.lastProcessedBlock,
      rangesScanned: 0,
      inserted: 0,
      alreadyKnown: 0,
      advanced: false,
      blocked: false,
      launches: [],
    };
  }

  while (next <= upper) {
    if (input.maxRanges !== undefined && rangesScanned >= input.maxRanges) {
      break;
    }
    const to = Math.min(next + outer - 1, upper);
    workerLog(`pools instant scan ${next}-${to} (head=${head})`);
    const result = await scanPoolsInstantRange({
      rpc: input.rpc,
      supabase: input.supabase,
      fromBlock: next,
      toBlock: to,
      productionStartBlock: input.productionStartBlock,
      observationStartBlock: input.observationStartBlock,
      onPersisted: input.onPersisted,
    });
    rangesScanned += 1;
    inserted += result.inserted;
    alreadyKnown += result.alreadyKnown + result.skippedPreBoundary;
    launches.push(...result.discovered);

    if (!result.fullyProcessed) {
      workerLog(
        `pools instant scan incomplete for ${next}-${to}; cursor stays at ${durableN}`,
      );
      return {
        head,
        lastProcessedBlock: durableN,
        rangesScanned,
        inserted,
        alreadyKnown,
        advanced,
        blocked: true,
        launches,
      };
    }

    const updated = await upsertCursor(input.supabase, {
      streamName: CURSOR_STREAM_POOLS_INSTANT,
      chainId: input.chainId,
      lastProcessedBlock: to,
    });
    durableN = updated.lastProcessedBlock;
    advanced = true;
    workerLog(`cursor pools_instant -> ${durableN}`);
    next = durableN + 1;
  }

  return {
    head,
    lastProcessedBlock: durableN,
    rangesScanned,
    inserted,
    alreadyKnown,
    advanced,
    blocked: false,
    launches,
  };
}

/**
 * Isolated Instant catch-up: never throws into the PONS poll/catch-up path.
 */
export async function catchUpPoolsInstantCursorIsolated(
  input: Parameters<typeof catchUpPoolsInstantCursor>[0],
): Promise<PoolsInstantCatchUpResult | null> {
  try {
    return await catchUpPoolsInstantCursor(input);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    workerLog(`pools instant catch-up failed (isolated; PONS continues): ${msg}`);
    return null;
  }
}
