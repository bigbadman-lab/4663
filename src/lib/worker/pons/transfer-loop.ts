/**
 * Catch-up for pons_transfers with factory ordering invariant.
 *
 * Before committing Transfer cursor through block N, factory cursor must be
 * durably processed through at least N.
 */

import {
  CURSOR_STREAM_PONS_FACTORIES,
  CURSOR_STREAM_PONS_TRANSFERS,
} from "@/lib/pons/constants";
import type { PonsFactoryDefinition } from "@/lib/pons/factories";
import type { WorkerMemoryModel } from "@/lib/pons/types";
import type { ChainRpc } from "@/lib/worker/chain/rpc";
import { TRANSFER_SCAN_MAX_CHUNK_BLOCKS } from "@/lib/worker/constants";
import { prepareStartupCursors } from "@/lib/worker/cursor-runtime";
import { workerLog } from "@/lib/worker/log";
import { catchUpFactoryCursor } from "@/lib/worker/pons/factory-loop";
import { scanTransferRange } from "@/lib/worker/pons/transfer-scanner";
import { loadCursor, upsertCursor } from "@/lib/worker/repositories/cursors";
import type { WorkerSupabase } from "@/lib/worker/supabase";
import type { ResolvedPonsLaunch } from "@/lib/pons/launch-discovery";

export type TransferCatchUpResult = {
  head: number;
  lastProcessedBlock: number | null;
  rangesScanned: number;
  newFirstBuyers: number;
  advanced: boolean;
  blocked: boolean;
  failures: string[];
};

export async function catchUpTransferCursor(input: {
  rpc: ChainRpc;
  supabase: WorkerSupabase;
  chainId: number;
  factories: readonly PonsFactoryDefinition[];
  memory: WorkerMemoryModel;
  startupRewind: boolean;
  maxOuterRangeBlocks?: number;
  maxRanges?: number;
  onFactoryInserted?: (launch: ResolvedPonsLaunch) => void;
}): Promise<TransferCatchUpResult> {
  const head = await input.rpc.getBlockNumber();
  const cursor = await loadCursor(
    input.supabase,
    CURSOR_STREAM_PONS_TRANSFERS,
    input.chainId,
  );

  if (!cursor) {
    workerLog(
      "transfer cursor missing — run npm run worker:bootstrap-transfers before transfer scan",
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
      new Map([[CURSOR_STREAM_PONS_TRANSFERS, cursor]]),
    )[0]!;
    from = plan.startupFromBlock;
    workerLog(
      `transfer startup resume from ${from} (durable N=${cursor.lastProcessedBlock}, rewind in memory only)`,
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

  const outer =
    input.maxOuterRangeBlocks ?? TRANSFER_SCAN_MAX_CHUNK_BLOCKS;

  let durableN = cursor.lastProcessedBlock;
  let rangesScanned = 0;
  let newFirstBuyers = 0;
  let advanced = false;
  const failures: string[] = [];
  let next = from;

  while (next <= head) {
    if (
      input.maxRanges !== undefined &&
      rangesScanned >= input.maxRanges
    ) {
      break;
    }

    const to = Math.min(next + outer - 1, head);

    // Invariant: factory must be durable through `to` before transfer commit.
    const factory = await loadCursor(
      input.supabase,
      CURSOR_STREAM_PONS_FACTORIES,
      input.chainId,
    );
    if (!factory) {
      workerLog("factory cursor missing; cannot advance transfers safely");
      return {
        head,
        lastProcessedBlock: durableN,
        rangesScanned,
        newFirstBuyers,
        advanced,
        blocked: true,
        failures: ["factory cursor missing"],
      };
    }

    if (factory.lastProcessedBlock < to) {
      workerLog(
        `factory behind transfer target (factory=${factory.lastProcessedBlock} < to=${to}); catching up factories first`,
      );
      const factoryCatch = await catchUpFactoryCursor({
        rpc: input.rpc,
        supabase: input.supabase,
        chainId: input.chainId,
        factories: input.factories,
        startupRewind: false,
        maxOuterRangeBlocks: outer,
        targetThroughBlock: to,
        onInserted: input.onFactoryInserted,
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
          `factory still behind after catch-up (have=${factoryAfter?.lastProcessedBlock ?? "null"} need=${to}); transfer blocked`,
        );
        return {
          head,
          lastProcessedBlock: durableN,
          rangesScanned,
          newFirstBuyers,
          advanced,
          blocked: true,
          failures: ["factory lag"],
        };
      }
    }

    workerLog(
      `transfer scan ${next}-${to} active=${input.memory.activeTokens.size} head=${head}`,
    );
    const result = await scanTransferRange({
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
      `transfer metrics logs=${result.transferLogs} candidates=${result.marketToWalletCandidates} validations=${result.txValidations} newBuyers=${result.newFirstBuyers} known=${result.alreadyKnownBuyers} notBuys=${result.notBuys}`,
    );

    if (!result.fullyProcessed) {
      failures.push(...result.failures);
      workerLog(
        `transfer range incomplete; cursor stays at ${durableN}`,
      );
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

    // Re-check factory ordering immediately before commit (safety).
    const factoryFinal = await loadCursor(
      input.supabase,
      CURSOR_STREAM_PONS_FACTORIES,
      input.chainId,
    );
    if (!factoryFinal || factoryFinal.lastProcessedBlock < to) {
      workerLog("factory lag at commit barrier; not advancing transfers");
      return {
        head,
        lastProcessedBlock: durableN,
        rangesScanned,
        newFirstBuyers,
        advanced,
        blocked: true,
        failures: ["factory lag at commit"],
      };
    }

    const updated = await upsertCursor(input.supabase, {
      streamName: CURSOR_STREAM_PONS_TRANSFERS,
      chainId: input.chainId,
      lastProcessedBlock: to,
    });
    durableN = updated.lastProcessedBlock;
    advanced = true;
    workerLog(`cursor pons_transfers -> ${durableN}`);
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
