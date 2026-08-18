/**
 * Catch-up for pons_v2_curve_fees with factory discovery-before-fee invariant.
 *
 * Before committing the fee cursor through block N, pons_factories must be
 * durably processed through at least N.
 *
 * Isolated from RADAR qualification, continuation, and PONS/POOLS failure paths.
 */

import { CURSOR_STREAM_PONS_FACTORIES } from "@/lib/pons/constants";
import { CURSOR_STREAM_PONS_V2_CURVE_FEES } from "@/lib/pons/curve-fee/constants";
import {
  addPonsV2LaunchToFeeIndex,
  type PonsV2FeeCurveIndex,
} from "@/lib/pons/curve-fee/curve-map";
import type { PonsFactoryDefinition } from "@/lib/pons/factories";
import type { ResolvedPonsLaunch } from "@/lib/pons/launch-discovery";
import type { ChainRpc } from "@/lib/worker/chain/rpc";
import {
  FACTORY_SCAN_MAX_CHUNK_BLOCKS,
  PONS_V2_FEE_CATCH_UP_MAX_BLOCKS_PER_CYCLE,
  PONS_V2_FEE_CATCH_UP_MAX_RANGES_PER_CYCLE,
} from "@/lib/worker/constants";
import { prepareStartupCursors } from "@/lib/worker/cursor-runtime";
import { workerLog } from "@/lib/worker/log";
import { catchUpFactoryCursor } from "@/lib/worker/pons/factory-loop";
import { scanPonsV2CurveFeesLiveRange } from "@/lib/worker/pons/curve-fee-scanner";
import { loadCursor, upsertCursor } from "@/lib/worker/repositories/cursors";
import type { WorkerSupabase } from "@/lib/worker/supabase";

export type PonsV2CurveFeeCatchUpResult = {
  head: number;
  lastProcessedBlock: number | null;
  rangesScanned: number;
  blocksScanned: number;
  rawLogs: number;
  decodedBuys: number;
  decodedSells: number;
  unknownCurves: number;
  malformed: number;
  inserted: number;
  skippedDuplicates: number;
  feesAddedQuoteByTokenCount: number;
  advanced: boolean;
  blocked: boolean;
  idle: boolean;
  caughtUp: boolean;
  lag: number | null;
  failures: string[];
};

export function formatPonsV2FeeCycleLog(
  result: PonsV2CurveFeeCatchUpResult,
  curvesTracked: number,
): string {
  if (result.idle) {
    return (
      "pons v2 fees idle cursor_missing — bootstrap: " +
      "npm run worker:bootstrap-pons-v2-fees -- --lookback-hours 24"
    );
  }
  const cursor = result.lastProcessedBlock ?? "null";
  const lag = result.lag ?? "null";
  const fail =
    result.failures.length === 0 ? "none" : result.failures.join(" | ");
  return (
    `pons v2 fees cursor=${cursor} head=${result.head} lag=${lag} ` +
    `ranges=${result.rangesScanned} blocks=${result.blocksScanned} ` +
    `inserted=${result.inserted} dupes=${result.skippedDuplicates} ` +
    `tokens=${result.feesAddedQuoteByTokenCount} curves=${curvesTracked} ` +
    `caught_up=${result.caughtUp} blocked=${result.blocked} failures=${fail}`
  );
}

function withProgress(
  head: number,
  partial: Omit<
    PonsV2CurveFeeCatchUpResult,
    "head" | "caughtUp" | "lag" | "idle" | "blocksScanned"
  > & { idle?: boolean; blocksScanned?: number },
): PonsV2CurveFeeCatchUpResult {
  const last = partial.lastProcessedBlock;
  const lag = last === null ? null : Math.max(0, head - last);
  const idle = partial.idle ?? false;
  const blocksScanned = partial.blocksScanned ?? 0;
  return {
    ...partial,
    head,
    idle,
    blocksScanned,
    caughtUp: !idle && last !== null && last >= head && partial.failures.length === 0,
    lag,
  };
}

export async function catchUpPonsV2CurveFeesCursor(input: {
  rpc: ChainRpc;
  supabase: WorkerSupabase;
  chainId: number;
  factories: readonly PonsFactoryDefinition[];
  index: PonsV2FeeCurveIndex;
  startupRewind: boolean;
  maxOuterRangeBlocks?: number;
  maxRanges?: number;
  maxBlocks?: number;
  productionStartBlock?: number;
  observationStartBlock?: number | null;
  onFactoryInserted?: (launch: ResolvedPonsLaunch) => void;
}): Promise<PonsV2CurveFeeCatchUpResult> {
  const head = await input.rpc.getBlockNumber();
  const cursor = await loadCursor(
    input.supabase,
    CURSOR_STREAM_PONS_V2_CURVE_FEES,
    input.chainId,
  );

  if (!cursor) {
    workerLog(
      "pons_v2_curve_fees cursor missing — fee stream idle until npm run worker:bootstrap-pons-v2-fees -- --lookback-hours 24",
    );
    return withProgress(head, {
      lastProcessedBlock: null,
      rangesScanned: 0,
      rawLogs: 0,
      decodedBuys: 0,
      decodedSells: 0,
      unknownCurves: 0,
      malformed: 0,
      inserted: 0,
      skippedDuplicates: 0,
      feesAddedQuoteByTokenCount: 0,
      advanced: false,
      blocked: false,
      idle: true,
      failures: [],
    });
  }

  let from: number;
  if (input.startupRewind) {
    const plan = prepareStartupCursors(
      new Map([[CURSOR_STREAM_PONS_V2_CURVE_FEES, cursor]]),
    )[0]!;
    from = plan.startupFromBlock;
    workerLog(
      `pons v2 fee startup resume from ${from} (durable N=${cursor.lastProcessedBlock}, rewind in memory only)`,
    );
  } else {
    from = cursor.lastProcessedBlock + 1;
  }

  if (from > head) {
    return withProgress(head, {
      lastProcessedBlock: cursor.lastProcessedBlock,
      rangesScanned: 0,
      rawLogs: 0,
      decodedBuys: 0,
      decodedSells: 0,
      unknownCurves: 0,
      malformed: 0,
      inserted: 0,
      skippedDuplicates: 0,
      feesAddedQuoteByTokenCount: 0,
      advanced: false,
      blocked: false,
      failures: [],
    });
  }

  const outer = input.maxOuterRangeBlocks ?? FACTORY_SCAN_MAX_CHUNK_BLOCKS;
  const maxRanges =
    input.maxRanges ?? PONS_V2_FEE_CATCH_UP_MAX_RANGES_PER_CYCLE;
  const maxBlocks =
    input.maxBlocks ?? PONS_V2_FEE_CATCH_UP_MAX_BLOCKS_PER_CYCLE;
  let durableN = cursor.lastProcessedBlock;
  let rangesScanned = 0;
  let blocksScanned = 0;
  let rawLogs = 0;
  let decodedBuys = 0;
  let decodedSells = 0;
  let unknownCurves = 0;
  let malformed = 0;
  let inserted = 0;
  let skippedDuplicates = 0;
  let feesAddedQuoteByTokenCount = 0;
  let advanced = false;
  const failures: string[] = [];
  let next = from;

  const snapshot = (blocked: boolean, extraFailures: string[] = []) =>
    withProgress(head, {
      lastProcessedBlock: durableN,
      rangesScanned,
      blocksScanned,
      rawLogs,
      decodedBuys,
      decodedSells,
      unknownCurves,
      malformed,
      inserted,
      skippedDuplicates,
      feesAddedQuoteByTokenCount,
      advanced,
      blocked,
      failures: [...failures, ...extraFailures],
    });

  const onFactoryInserted = (launch: ResolvedPonsLaunch) => {
    addPonsV2LaunchToFeeIndex(input.index, launch);
    input.onFactoryInserted?.(launch);
  };

  while (next <= head) {
    if (rangesScanned >= maxRanges || blocksScanned >= maxBlocks) {
      break;
    }

    const to = Math.min(next + outer - 1, head);

    const factory = await loadCursor(
      input.supabase,
      CURSOR_STREAM_PONS_FACTORIES,
      input.chainId,
    );
    if (!factory) {
      workerLog(
        "pons_factories cursor missing; cannot advance pons_v2_curve_fees safely",
      );
      return snapshot(true, ["pons_factories cursor missing"]);
    }

    if (factory.lastProcessedBlock < to) {
      workerLog(
        `pons_factories behind fee target (factory=${factory.lastProcessedBlock} < to=${to}); catching up factories first`,
      );
      const factoryCatch = await catchUpFactoryCursor({
        rpc: input.rpc,
        supabase: input.supabase,
        chainId: input.chainId,
        factories: input.factories,
        startupRewind: false,
        maxOuterRangeBlocks: outer,
        maxRanges,
        targetThroughBlock: to,
        productionStartBlock: input.productionStartBlock,
        observationStartBlock: input.observationStartBlock,
        onInserted: onFactoryInserted,
      });
      const factoryAfter = await loadCursor(
        input.supabase,
        CURSOR_STREAM_PONS_FACTORIES,
        input.chainId,
      );
      if (
        !factoryAfter ||
        factoryAfter.lastProcessedBlock < to ||
        factoryCatch.blocked
      ) {
        workerLog(
          `pons_factories still behind after catch-up (have=${factoryAfter?.lastProcessedBlock ?? "null"} need=${to}); fees blocked`,
        );
        return snapshot(true, ["pons_factories lag"]);
      }
    }

    let result: Awaited<ReturnType<typeof scanPonsV2CurveFeesLiveRange>>;
    try {
      result = await scanPonsV2CurveFeesLiveRange({
        rpc: input.rpc,
        supabase: input.supabase,
        chainId: input.chainId,
        fromBlock: next,
        toBlock: to,
        index: input.index,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      workerLog(
        `pons v2 fee scan ${next}-${to} threw; cursor stays at ${durableN}: ${msg}`,
      );
      return snapshot(true, [`scan_failed: ${msg}`]);
    }

    rangesScanned += 1;
    rawLogs += result.rawLogs;
    decodedBuys += result.decodedBuys;
    decodedSells += result.decodedSells;
    unknownCurves += result.unknownCurves;
    malformed += result.malformed;
    inserted += result.inserted;
    skippedDuplicates += result.skippedDuplicates;
    feesAddedQuoteByTokenCount += result.feesAddedQuoteByTokenCount;

    if (!result.fullyProcessed) {
      failures.push(...result.failures);
      workerLog(
        `pons v2 fee range incomplete; cursor stays at ${durableN}`,
      );
      return snapshot(true);
    }

    const factoryFinal = await loadCursor(
      input.supabase,
      CURSOR_STREAM_PONS_FACTORIES,
      input.chainId,
    );
    if (!factoryFinal || factoryFinal.lastProcessedBlock < to) {
      workerLog(
        "pons_factories lag at commit barrier; not advancing pons_v2_curve_fees",
      );
      return snapshot(true, ["pons_factories lag at commit"]);
    }

    const updated = await upsertCursor(input.supabase, {
      streamName: CURSOR_STREAM_PONS_V2_CURVE_FEES,
      chainId: input.chainId,
      lastProcessedBlock: to,
    });
    durableN = updated.lastProcessedBlock;
    advanced = true;
    blocksScanned += to - next + 1;
    next = durableN + 1;
  }

  return snapshot(false);
}

/**
 * Isolated fee catch-up: never throws into PONS factories/transfers or POOLS.
 */
export async function catchUpPonsV2CurveFeesCursorIsolated(
  input: Parameters<typeof catchUpPonsV2CurveFeesCursor>[0],
): Promise<PonsV2CurveFeeCatchUpResult | null> {
  try {
    return await catchUpPonsV2CurveFeesCursor(input);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    workerLog(
      `pons v2 fee catch-up failed (isolated; PONS and POOLS continue): ${msg}`,
    );
    return null;
  }
}
