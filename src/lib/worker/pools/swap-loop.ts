/**
 * Catch-up for pools_swaps with Instant discovery-before-activity invariant.
 *
 * Before committing the swap cursor through block N, pools_instant must be
 * durably processed through at least N.
 */

import {
  CURSOR_STREAM_POOLS_INSTANT,
  CURSOR_STREAM_POOLS_SWAPS,
} from "@/lib/pools/constants";
import type { ChainRpc } from "@/lib/worker/chain/rpc";
import {
  POOLS_CATCH_UP_MAX_RANGES_PER_CYCLE,
  TRANSFER_SCAN_MAX_CHUNK_BLOCKS,
} from "@/lib/worker/constants";
import { prepareStartupCursors } from "@/lib/worker/cursor-runtime";
import { workerLog } from "@/lib/worker/log";
import { catchUpPoolsInstantCursor } from "@/lib/worker/pools/instant-loop";
import { prunePoolsContinuationWatchByAge, type PoolsWorkerMemory } from "@/lib/worker/pools/state";
import { scanPoolsSwapRange } from "@/lib/worker/pools/swap-scanner";
import { loadCursor, upsertCursor } from "@/lib/worker/repositories/cursors";
import type { PoolsInstantLaunchRow } from "@/lib/worker/repositories/pools-launches";
import type { WorkerSupabase } from "@/lib/worker/supabase";

export type PoolsSwapCatchUpResult = {
  head: number;
  lastProcessedBlock: number | null;
  rangesScanned: number;
  newFirstBuyers: number;
  advanced: boolean;
  blocked: boolean;
  failures: string[];
};

export async function catchUpPoolsSwapCursor(input: {
  rpc: ChainRpc;
  supabase: WorkerSupabase;
  chainId: number;
  memory: PoolsWorkerMemory;
  startupRewind: boolean;
  maxOuterRangeBlocks?: number;
  maxRanges?: number;
  productionStartBlock?: number;
  observationStartBlock?: number | null;
  onInstantPersisted?: (row: PoolsInstantLaunchRow) => void;
}): Promise<PoolsSwapCatchUpResult> {
  const head = await input.rpc.getBlockNumber();
  const cursor = await loadCursor(
    input.supabase,
    CURSOR_STREAM_POOLS_SWAPS,
    input.chainId,
  );

  if (!cursor) {
    workerLog(
      "pools_swaps cursor missing — Instant activity idle until bootstrap",
    );
    return {
      head,
      lastProcessedBlock: null,
      rangesScanned: 0,
      newFirstBuyers: 0,
      advanced: false,
      blocked: false,
      failures: [],
    };
  }

  let from: number;
  if (input.startupRewind) {
    const plan = prepareStartupCursors(
      new Map([[CURSOR_STREAM_POOLS_SWAPS, cursor]]),
    )[0]!;
    from = plan.startupFromBlock;
    workerLog(
      `pools swaps startup resume from ${from} (durable N=${cursor.lastProcessedBlock}, rewind in memory only)`,
    );
  } else {
    from = cursor.lastProcessedBlock + 1;
  }

  if (from > head) {
    return {
      head,
      lastProcessedBlock: cursor.lastProcessedBlock,
      rangesScanned: 0,
      newFirstBuyers: 0,
      advanced: false,
      blocked: false,
      failures: [],
    };
  }

  const outer = input.maxOuterRangeBlocks ?? TRANSFER_SCAN_MAX_CHUNK_BLOCKS;
  let durableN = cursor.lastProcessedBlock;
  let rangesScanned = 0;
  let newFirstBuyers = 0;
  let advanced = false;
  const failures: string[] = [];
  let next = from;

  while (next <= head) {
    if (input.maxRanges !== undefined && rangesScanned >= input.maxRanges) {
      break;
    }

    const to = Math.min(next + outer - 1, head);

    const instant = await loadCursor(
      input.supabase,
      CURSOR_STREAM_POOLS_INSTANT,
      input.chainId,
    );
    if (!instant) {
      workerLog(
        "pools_instant cursor missing; cannot advance pools_swaps safely",
      );
      return {
        head,
        lastProcessedBlock: durableN,
        rangesScanned,
        newFirstBuyers,
        advanced,
        blocked: true,
        failures: ["pools_instant cursor missing"],
      };
    }

    if (instant.lastProcessedBlock < to) {
      workerLog(
        `pools_instant behind swap target (instant=${instant.lastProcessedBlock} < to=${to}); catching up Instant first`,
      );
      const instantCatch = await catchUpPoolsInstantCursor({
        rpc: input.rpc,
        supabase: input.supabase,
        chainId: input.chainId,
        startupRewind: false,
        maxOuterRangeBlocks: outer,
        // Bound nested Instant so a lagging Instant cursor cannot become
        // an until-head loop inside one swap iteration.
        maxRanges: input.maxRanges ?? POOLS_CATCH_UP_MAX_RANGES_PER_CYCLE,
        targetThroughBlock: to,
        productionStartBlock: input.productionStartBlock,
        observationStartBlock: input.observationStartBlock,
        onPersisted: input.onInstantPersisted,
      });
      const instantAfter = await loadCursor(
        input.supabase,
        CURSOR_STREAM_POOLS_INSTANT,
        input.chainId,
      );
      if (
        !instantAfter ||
        instantAfter.lastProcessedBlock < to ||
        instantCatch.blocked
      ) {
        workerLog(
          `pools_instant still behind after catch-up (have=${instantAfter?.lastProcessedBlock ?? "null"} need=${to}); swaps blocked`,
        );
        return {
          head,
          lastProcessedBlock: durableN,
          rangesScanned,
          newFirstBuyers,
          advanced,
          blocked: true,
          failures: ["pools_instant lag"],
        };
      }
    }

    workerLog(
      `pools swap scan ${next}-${to} watch=${input.memory.watch.size} head=${head}`,
    );
    const result = await scanPoolsSwapRange({
      rpc: input.rpc,
      supabase: input.supabase,
      chainId: input.chainId,
      memory: input.memory,
      fromBlock: next,
      toBlock: to,
    });
    rangesScanned += 1;
    newFirstBuyers += result.newFirstBuyers;

    workerLog(
      `pools swap metrics logs=${result.rawLogs} decoded=${result.decodedSwaps} newBuyers=${result.newFirstBuyers} known=${result.alreadyKnownBuyers} sells=${result.sells} unknown=${result.unknownPools}`,
    );

    if (!result.fullyProcessed) {
      failures.push(...result.failures);
      workerLog(`pools swap range incomplete; cursor stays at ${durableN}`);
      return {
        head,
        lastProcessedBlock: durableN,
        rangesScanned,
        newFirstBuyers,
        advanced,
        blocked: true,
        failures,
      };
    }

    const instantFinal = await loadCursor(
      input.supabase,
      CURSOR_STREAM_POOLS_INSTANT,
      input.chainId,
    );
    if (!instantFinal || instantFinal.lastProcessedBlock < to) {
      workerLog("pools_instant lag at commit barrier; not advancing pools_swaps");
      return {
        head,
        lastProcessedBlock: durableN,
        rangesScanned,
        newFirstBuyers,
        advanced,
        blocked: true,
        failures: ["pools_instant lag at commit"],
      };
    }

    const rangeEndBlock = await input.rpc.getBlock(to);
    prunePoolsContinuationWatchByAge(input.memory, rangeEndBlock.timestamp);

    const updated = await upsertCursor(input.supabase, {
      streamName: CURSOR_STREAM_POOLS_SWAPS,
      chainId: input.chainId,
      lastProcessedBlock: to,
    });
    durableN = updated.lastProcessedBlock;
    advanced = true;
    workerLog(`cursor pools_swaps -> ${durableN}`);
    next = durableN + 1;
  }

  return {
    head,
    lastProcessedBlock: durableN,
    rangesScanned,
    newFirstBuyers,
    advanced,
    blocked: false,
    failures,
  };
}

/**
 * Isolated Instant activity catch-up: never throws into PONS or Instant discovery.
 */
export async function catchUpPoolsSwapCursorIsolated(
  input: Parameters<typeof catchUpPoolsSwapCursor>[0],
): Promise<PoolsSwapCatchUpResult | null> {
  try {
    return await catchUpPoolsSwapCursor(input);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    workerLog(
      `pools swaps catch-up failed (isolated; PONS and Instant continue): ${msg}`,
    );
    return null;
  }
}
