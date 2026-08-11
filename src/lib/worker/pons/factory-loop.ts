/**
 * Catch-up / continuous pons_factories cursor progression.
 */

import { CURSOR_STREAM_PONS_FACTORIES } from "@/lib/pons/constants";
import type { PonsFactoryDefinition } from "@/lib/pons/factories";
import type { ResolvedPonsLaunch } from "@/lib/pons/launch-discovery";
import type { ChainRpc } from "@/lib/worker/chain/rpc";
import { FACTORY_SCAN_MAX_CHUNK_BLOCKS } from "@/lib/worker/constants";
import { prepareStartupCursors } from "@/lib/worker/cursor-runtime";
import { workerLog } from "@/lib/worker/log";
import { loadCursor, upsertCursor } from "@/lib/worker/repositories/cursors";
import { scanFactoryRange } from "@/lib/worker/pons/factory-scanner";
import type { WorkerSupabase } from "@/lib/worker/supabase";

export type FactoryCatchUpResult = {
  head: number;
  /** Durable cursor after catch-up (or previous if nothing done / failure). */
  lastProcessedBlock: number | null;
  rangesScanned: number;
  inserted: number;
  alreadyKnown: number;
  advanced: boolean;
  blocked: boolean;
  launches: ResolvedPonsLaunch[];
};

/**
 * Process unprocessed factory blocks from runtime resume point through head.
 * Advances cursor only after each fully successful range.
 *
 * @param startupRewind when true, first resume uses max(0,N-5) without writing N.
 */
export async function catchUpFactoryCursor(input: {
  rpc: ChainRpc;
  supabase: WorkerSupabase;
  chainId: number;
  factories: readonly PonsFactoryDefinition[];
  startupRewind: boolean;
  /** Max blocks per outer progressive step (after adaptive inner chunks). */
  maxOuterRangeBlocks?: number;
  /** Stop after this many successful/partial outer ranges (smoke / once mode). */
  maxRanges?: number;
  /**
   * Stop once durable factory cursor is >= this block (inclusive).
   * Used so Transfer scan can force factories only through the Transfer range end.
   */
  targetThroughBlock?: number;
  /** Production boundary B; skips insert of launches at or before B */
  productionStartBlock?: number;
  onInserted?: (launch: ResolvedPonsLaunch) => void;
}): Promise<FactoryCatchUpResult> {
  const head = await input.rpc.getBlockNumber();
  const cursor = await loadCursor(
    input.supabase,
    CURSOR_STREAM_PONS_FACTORIES,
    input.chainId,
  );

  if (!cursor) {
    workerLog(
      "factory cursor missing — run npm run worker:bootstrap-factories before live scan",
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
      new Map([[CURSOR_STREAM_PONS_FACTORIES, cursor]]),
    )[0]!;
    from = plan.startupFromBlock;
    workerLog(
      `factory startup resume from ${from} (durable N=${cursor.lastProcessedBlock}, rewind applied in memory only)`,
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

  const outer =
    input.maxOuterRangeBlocks ?? FACTORY_SCAN_MAX_CHUNK_BLOCKS;

  let durableN = cursor.lastProcessedBlock;
  let rangesScanned = 0;
  let inserted = 0;
  let alreadyKnown = 0;
  let advanced = false;
  const launches: ResolvedPonsLaunch[] = [];
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
    if (
      input.maxRanges !== undefined &&
      rangesScanned >= input.maxRanges
    ) {
      break;
    }
    const to = Math.min(next + outer - 1, upper);
    workerLog(`factory scan ${next}-${to} (head=${head})`);
    const result = await scanFactoryRange({
      rpc: input.rpc,
      supabase: input.supabase,
      factories: input.factories,
      fromBlock: next,
      toBlock: to,
      productionStartBlock: input.productionStartBlock,
      onInserted: input.onInserted,
    });
    rangesScanned += 1;
    inserted += result.inserted;
    alreadyKnown += result.alreadyKnown + result.skippedPreBoundary;
    launches.push(...result.discovered);

    if (!result.fullyProcessed) {
      workerLog(
        `factory scan incomplete for ${next}-${to}; cursor not advanced past durable N=${durableN}`,
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
      streamName: CURSOR_STREAM_PONS_FACTORIES,
      chainId: input.chainId,
      lastProcessedBlock: to,
    });
    durableN = updated.lastProcessedBlock;
    advanced = true;
    workerLog(`cursor pons_factories -> ${durableN}`);
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
