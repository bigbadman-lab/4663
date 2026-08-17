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
  failures: string[];
};

export async function catchUpPonsV2CurveFeesCursor(input: {
  rpc: ChainRpc;
  supabase: WorkerSupabase;
  chainId: number;
  factories: readonly PonsFactoryDefinition[];
  index: PonsV2FeeCurveIndex;
  startupRewind: boolean;
  maxOuterRangeBlocks?: number;
  maxRanges?: number;
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
      "pons_v2_curve_fees cursor missing — fee stream idle until npm run worker:bootstrap-pons-v2-fees",
    );
    return {
      head,
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
      failures: [],
    };
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
    return {
      head,
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
    };
  }

  const outer = input.maxOuterRangeBlocks ?? FACTORY_SCAN_MAX_CHUNK_BLOCKS;
  let durableN = cursor.lastProcessedBlock;
  let rangesScanned = 0;
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

  const onFactoryInserted = (launch: ResolvedPonsLaunch) => {
    addPonsV2LaunchToFeeIndex(input.index, launch);
    input.onFactoryInserted?.(launch);
  };

  while (next <= head) {
    if (input.maxRanges !== undefined && rangesScanned >= input.maxRanges) {
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
      return {
        head,
        lastProcessedBlock: durableN,
        rangesScanned,
        rawLogs,
        decodedBuys,
        decodedSells,
        unknownCurves,
        malformed,
        inserted,
        skippedDuplicates,
        feesAddedQuoteByTokenCount,
        advanced,
        blocked: true,
        failures: ["pons_factories cursor missing"],
      };
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
        maxRanges: input.maxRanges ?? PONS_V2_FEE_CATCH_UP_MAX_RANGES_PER_CYCLE,
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
        return {
          head,
          lastProcessedBlock: durableN,
          rangesScanned,
          rawLogs,
          decodedBuys,
          decodedSells,
          unknownCurves,
          malformed,
          inserted,
          skippedDuplicates,
          feesAddedQuoteByTokenCount,
          advanced,
          blocked: true,
          failures: ["pons_factories lag"],
        };
      }
    }

    workerLog(
      `pons v2 fee scan ${next}-${to} head=${head} curves=${input.index.byCurve.size}`,
    );
    const result = await scanPonsV2CurveFeesLiveRange({
      rpc: input.rpc,
      supabase: input.supabase,
      chainId: input.chainId,
      fromBlock: next,
      toBlock: to,
      index: input.index,
    });
    rangesScanned += 1;
    rawLogs += result.rawLogs;
    decodedBuys += result.decodedBuys;
    decodedSells += result.decodedSells;
    unknownCurves += result.unknownCurves;
    malformed += result.malformed;
    inserted += result.inserted;
    skippedDuplicates += result.skippedDuplicates;
    feesAddedQuoteByTokenCount += result.feesAddedQuoteByTokenCount;

    workerLog(
      `pons v2 fee scan ${next}-${to} head=${head} rawLogs=${result.rawLogs} decodedBuys=${result.decodedBuys} decodedSells=${result.decodedSells} unknownCurves=${result.unknownCurves} malformed=${result.malformed} inserted=${result.inserted} duplicates=${result.skippedDuplicates} feesAddedQuoteByTokenCount=${result.feesAddedQuoteByTokenCount} failures=${result.failures.length}`,
    );

    if (!result.fullyProcessed) {
      failures.push(...result.failures);
      workerLog(
        `pons v2 fee range incomplete; cursor stays at ${durableN}`,
      );
      return {
        head,
        lastProcessedBlock: durableN,
        rangesScanned,
        rawLogs,
        decodedBuys,
        decodedSells,
        unknownCurves,
        malformed,
        inserted,
        skippedDuplicates,
        feesAddedQuoteByTokenCount,
        advanced,
        blocked: true,
        failures,
      };
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
      return {
        head,
        lastProcessedBlock: durableN,
        rangesScanned,
        rawLogs,
        decodedBuys,
        decodedSells,
        unknownCurves,
        malformed,
        inserted,
        skippedDuplicates,
        feesAddedQuoteByTokenCount,
        advanced,
        blocked: true,
        failures: ["pons_factories lag at commit"],
      };
    }

    const updated = await upsertCursor(input.supabase, {
      streamName: CURSOR_STREAM_PONS_V2_CURVE_FEES,
      chainId: input.chainId,
      lastProcessedBlock: to,
    });
    durableN = updated.lastProcessedBlock;
    advanced = true;
    workerLog(`cursor pons_v2_curve_fees -> ${durableN}`);
    next = durableN + 1;
  }

  return {
    head,
    lastProcessedBlock: durableN,
    rangesScanned,
    rawLogs,
    decodedBuys,
    decodedSells,
    unknownCurves,
    malformed,
    inserted,
    skippedDuplicates,
    feesAddedQuoteByTokenCount,
    advanced,
    blocked: false,
    failures,
  };
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
