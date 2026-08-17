/**
 * Standalone persistent worker (production mode after Stage 7A cutover).
 *
 * Pipeline: factories → transfers for production ACTIVE tokens → first buyers
 * → lifecycle fire/expire.
 *
 * Requires production_state cutover marker unless --dev-uncutover (once mode only).
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadDotenv({ path: resolve(process.cwd(), ".env"), quiet: true });

import {
  CONTINUATION_WATCH_END_SECONDS,
  CURSOR_STREAM_PONS_FACTORIES,
  CURSOR_STREAM_PONS_TRANSFERS,
  WORKER_NAME,
} from "@/lib/pons/constants";
import { buildFactoryDefinitions } from "@/lib/pons/factories";
import { loadWorkerConfig } from "@/lib/worker/config";
import { createChainRpc } from "@/lib/worker/chain/rpc";
import {
  FACTORY_POLL_INTERVAL_MS,
  HEARTBEAT_INTERVAL_MS,
  POOLS_CATCH_UP_MAX_RANGES_PER_CYCLE,
  PONS_V2_FEE_CATCH_UP_MAX_RANGES_PER_CYCLE,
} from "@/lib/worker/constants";
import { prepareStartupCursors } from "@/lib/worker/cursor-runtime";
import { workerError, workerLog } from "@/lib/worker/log";
import { catchUpPonsV2CurveFeesCursorIsolated } from "@/lib/worker/pons/curve-fee-loop";
import { catchUpFactoryCursor } from "@/lib/worker/pons/factory-loop";
import {
  addPonsV2LaunchToFeeIndex,
  reconstructPonsV2FeeCurveIndex,
} from "@/lib/pons/curve-fee/curve-map";
import { catchUpTransferCursor } from "@/lib/worker/pons/transfer-loop";
import { EVENT_SOURCE_POOLS } from "@/lib/pools/constants";
import { catchUpPoolsInstantCursorIsolated } from "@/lib/worker/pools/instant-loop";
import {
  addPoolsLaunchToWatch,
  poolsLaunchToWatched,
  reconstructPoolsWorkerMemory,
  type PoolsWorkerMemory,
} from "@/lib/worker/pools/state";
import { catchUpPoolsSwapCursorIsolated } from "@/lib/worker/pools/swap-loop";
import { loadPoolsFirstBuyersForTokens } from "@/lib/worker/repositories/pools-first-buyers";
import {
  loadPoolsInstantLaunchesForContinuationWatch,
  type PoolsInstantLaunchRow,
} from "@/lib/worker/repositories/pools-launches";
import {
  PRODUCTION_REFUSAL_MESSAGE,
  requireProductionCutover,
} from "@/lib/worker/production-mode";
import { loadKnownCursors } from "@/lib/worker/repositories/cursors";
import { loadFirstBuyersForTokens } from "@/lib/worker/repositories/first-buyers";
import {
  loadActiveLaunches,
  loadContinuationEventTokenAddresses,
  loadFiredLaunchesForContinuationWatch,
} from "@/lib/worker/repositories/launches";
import { loadProductionState } from "@/lib/worker/repositories/production-state";
import { upsertWorkerHealth } from "@/lib/worker/repositories/worker-health";
import {
  activeTokenCount,
  addActiveLaunchToMemory,
  addContinuationWatchLaunches,
  applyFirstBuyersToMemory,
  continuationWatchCount,
  reconstructWorkerMemory,
} from "@/lib/worker/state";
import { withCatchUpHeartbeat } from "@/lib/worker/startup-heartbeat";
import {
  createWorkerSupabase,
  proveSupabaseConnectivity,
  type WorkerSupabase,
} from "@/lib/worker/supabase";
import type { WorkerMemoryModel } from "@/lib/pons/types";
import type { CursorStreamName } from "@/lib/pons/types";
import type { CursorRow } from "@/lib/worker/db-types";

function formatCursorLog(
  stream: CursorStreamName,
  row: CursorRow | null,
  startupFrom: number,
): string {
  if (!row) {
    return `cursor ${stream}: none (startup from ${startupFrom})`;
  }
  return `cursor ${stream}: last_processed_block=${row.lastProcessedBlock} (startup from ${startupFrom})`;
}

/** Process liveness only. Stream progress is chain_cursors, not this row. */
async function writeHeartbeat(
  supabase: WorkerSupabase,
  memory: WorkerMemoryModel,
  opts: {
    latestChainBlock: number | null;
    latestProcessedBlock: number | null;
  },
): Promise<void> {
  await upsertWorkerHealth(supabase, {
    lastHeartbeatAt: new Date().toISOString(),
    latestChainBlock: opts.latestChainBlock,
    latestProcessedBlock: opts.latestProcessedBlock,
    activeTokens: activeTokenCount(memory),
  });
}

function highestProcessed(
  factoryN: number | null | undefined,
  transferN: number | null | undefined,
): number | null {
  const vals = [factoryN, transferN].filter(
    (n): n is number => typeof n === "number",
  );
  if (vals.length === 0) return null;
  return Math.max(...vals);
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const devUncutover = process.argv.includes("--dev-uncutover");

  workerLog("starting");
  workerLog(`worker_name=${WORKER_NAME}`);

  const config = loadWorkerConfig();
  workerLog(`chain_id=${config.chainId}`);

  const supabase = createWorkerSupabase(config);
  await proveSupabaseConnectivity(supabase);
  workerLog("supabase connected");

  const production = await loadProductionState(supabase, config.chainId);
  const gate = requireProductionCutover(production);

  let productionStartBlock: number | undefined;
  let observationStartBlock: number | null = null;

  if (!gate.ok) {
    if (devUncutover && once) {
      workerLog(
        "WARNING: --dev-uncutover (worker:once only) — no production boundary; do not use on Render",
      );
      productionStartBlock = undefined;
      observationStartBlock = null;
    } else if (devUncutover && !once) {
      throw new Error(
        "[4663-worker] --dev-uncutover is only allowed with --once (worker:once). Continuous worker requires production cutover.",
      );
    } else {
      throw new Error(PRODUCTION_REFUSAL_MESSAGE);
    }
  } else {
    productionStartBlock = gate.productionStartBlock;
    observationStartBlock = production?.observationStartBlock ?? null;
    workerLog(`production_start_block=${gate.productionStartBlock}`);
    workerLog(`cutover_version=${gate.cutoverVersion}`);
    if (observationStartBlock === null) {
      workerLog("observation_start_block=not_active");
      workerLog("production mode active");
      workerLog(
        `eligibility: launch_block_number > ${gate.productionStartBlock}`,
      );
    } else {
      workerLog(`observation_start_block=${observationStartBlock}`);
      if (production?.observationVersion) {
        workerLog(`observation_version=${production.observationVersion}`);
      }
      workerLog("production mode active (forward observation)");
      workerLog(
        `eligibility: launch_block_number >= ${observationStartBlock}`,
      );
    }
  }

  const watchBoundaryOpts = {
    productionStartBlock,
    observationStartBlock,
  };

  const rpc = createChainRpc(config.alchemyRpcUrl);
  const factories = buildFactoryDefinitions({
    factoryV1: config.ponsFactoryV1,
    factoryV2: config.ponsFactoryV2,
  });
  workerLog(`factories v1+v2 ready`);

  let cursors = await loadKnownCursors(supabase, config.chainId);
  for (const plan of prepareStartupCursors(cursors)) {
    workerLog(
      formatCursorLog(
        plan.streamName,
        cursors.get(plan.streamName) ?? null,
        plan.startupFromBlock,
      ),
    );
  }

  const launches = await loadActiveLaunches(supabase, config.chainId, {
    productionStartBlock,
    observationStartBlock,
  });
  const tokenAddresses = launches.map((l) => l.tokenAddress);
  const firstBuyers = await loadFirstBuyersForTokens(
    supabase,
    config.chainId,
    tokenAddresses,
  );

  const memory = reconstructWorkerMemory(launches, firstBuyers);
  if (observationStartBlock !== null) {
    workerLog(
      `active tokens (observation-eligible): ${activeTokenCount(memory)}`,
    );
  } else {
    workerLog(
      `active tokens (production-eligible): ${activeTokenCount(memory)}`,
    );
  }
  workerLog(`first buyers loaded: ${firstBuyers.length}`);

  // Tokens that already have continuation events must not re-fire.
  const alreadyContinuedActive = await loadContinuationEventTokenAddresses(
    supabase,
    config.chainId,
    tokenAddresses,
  );
  for (const addr of alreadyContinuedActive) {
    memory.continuationResolved.add(addr);
  }

  let latestChainBlock: number | null = null;
  let tipUnix: number | null = null;
  try {
    latestChainBlock = await rpc.getBlockNumber();
    workerLog(`chain head: ${latestChainBlock}`);
    const tipBlock = await rpc.getBlock(latestChainBlock);
    tipUnix = tipBlock.timestamp;
  } catch (error) {
    workerError("initial eth_blockNumber failed", error);
  }

  // Stage 11B: reconstruct continuation watch for fired launches still age < 300.
  if (tipUnix !== null) {
    const launchAfterUnix = tipUnix - CONTINUATION_WATCH_END_SECONDS;
    const launchAfterIso = new Date(launchAfterUnix * 1000).toISOString();
    const firedForCont = await loadFiredLaunchesForContinuationWatch(
      supabase,
      config.chainId,
      {
        launchTimestampAfterIso: launchAfterIso,
        productionStartBlock,
        observationStartBlock,
      },
    );
    const contAddrs = firedForCont.map((l) => l.tokenAddress);
    const alreadyContinued = await loadContinuationEventTokenAddresses(
      supabase,
      config.chainId,
      contAddrs,
    );
    const added = addContinuationWatchLaunches(memory, firedForCont, tipUnix, {
      continuationEventTokenAddresses: alreadyContinued,
    });
    if (added > 0) {
      const contBuyers = await loadFirstBuyersForTokens(
        supabase,
        config.chainId,
        [...memory.continuationWatch.keys()],
      );
      applyFirstBuyersToMemory(memory, contBuyers);
      workerLog(`continuation watch reconstructed: ${added}`);
      workerLog(`continuation first buyers loaded: ${contBuyers.length}`);
    }
    workerLog(
      `continuation watch tokens: ${continuationWatchCount(memory)}`,
    );
  }

  let poolsMemory: PoolsWorkerMemory;
  if (tipUnix !== null) {
    const launchAfterUnix = tipUnix - CONTINUATION_WATCH_END_SECONDS;
    const launchAfterIso = new Date(launchAfterUnix * 1000).toISOString();
    const poolsLaunches = await loadPoolsInstantLaunchesForContinuationWatch(
      supabase,
      config.chainId,
      {
        launchTimestampAfterIso: launchAfterIso,
        productionStartBlock,
        observationStartBlock,
      },
    );
    const poolsTokenAddrs = poolsLaunches.map((l) => l.tokenAddress);
    const poolsContinued = await loadContinuationEventTokenAddresses(
      supabase,
      config.chainId,
      poolsTokenAddrs,
      EVENT_SOURCE_POOLS,
    );
    const poolsBuyers = await loadPoolsFirstBuyersForTokens(
      supabase,
      config.chainId,
      poolsTokenAddrs,
    );
    poolsMemory = reconstructPoolsWorkerMemory(
      poolsLaunches,
      poolsBuyers,
      tipUnix,
      poolsContinued,
    );
    workerLog(
      `pools continuation watch reconstructed: ${poolsMemory.watch.size} buyers=${poolsBuyers.length}`,
    );
  } else {
    poolsMemory = reconstructPoolsWorkerMemory([], [], 0, new Set());
  }

  const feeIndex = await reconstructPonsV2FeeCurveIndex(
    supabase,
    config.chainId,
  );
  workerLog(`pons v2 fee curves tracked=${feeIndex.byCurve.size}`);

  const onLaunch = (launch: {
    tokenAddress: string;
    marketAddress: string;
    factoryAddress: string;
    factoryVersion: "v1" | "v2";
    launchTxHash: string;
    launchBlockNumber: number;
    launchBlockTimestampIso: string;
  }) => {
    addActiveLaunchToMemory(memory, launch, watchBoundaryOpts);
    addPonsV2LaunchToFeeIndex(feeIndex, launch);
  };

  const onPoolsLaunch = (row: PoolsInstantLaunchRow) => {
    addPoolsLaunchToWatch(
      poolsMemory,
      poolsLaunchToWatched(row),
      tipUnix ?? undefined,
    );
  };

  let latestProcessedBlock = highestProcessed(
    cursors.get(CURSOR_STREAM_PONS_FACTORIES)?.lastProcessedBlock,
    cursors.get(CURSOR_STREAM_PONS_TRANSFERS)?.lastProcessedBlock,
  );

  // Continuous mode: keep worker_health fresh during long startup catch-up.
  // once mode: no temporary interval (existing post-catch-up heartbeat + exit).
  await withCatchUpHeartbeat({
    once,
    intervalMs: HEARTBEAT_INTERVAL_MS,
    writeHeartbeat: async () => {
      await writeHeartbeat(supabase, memory, {
        latestChainBlock,
        latestProcessedBlock,
      });
      workerLog(
        `startup-heartbeat head=${latestChainBlock ?? "null"} processed=${latestProcessedBlock ?? "null"} active=${activeTokenCount(memory)}`,
      );
    },
    onHeartbeatError: (error) => {
      workerError("startup heartbeat failed", error);
    },
    runCatchUp: async () => {
      // 1) Factory catch-up first (discover launches before transfer range work).
      if (cursors.get(CURSOR_STREAM_PONS_FACTORIES)) {
        const catchUp = await catchUpFactoryCursor({
          rpc,
          supabase,
          chainId: config.chainId,
          factories,
          startupRewind: true,
          maxRanges: once ? 1 : undefined,
          productionStartBlock,
          observationStartBlock,
          onInserted: onLaunch,
        });
        latestChainBlock = catchUp.head;
        if (catchUp.lastProcessedBlock !== null) {
          latestProcessedBlock = highestProcessed(
            catchUp.lastProcessedBlock,
            cursors.get(CURSOR_STREAM_PONS_TRANSFERS)?.lastProcessedBlock,
          );
        }
        workerLog(
          `factory catch-up: inserted=${catchUp.inserted} known=${catchUp.alreadyKnown} ranges=${catchUp.rangesScanned} blocked=${catchUp.blocked}`,
        );
      } else {
        workerLog("no pons_factories cursor — factory discovery idle");
      }

      workerLog(`active tokens: ${activeTokenCount(memory)}`);

      // 2) Transfer catch-up (enforces factory >= transfer commit barrier).
      cursors = await loadKnownCursors(supabase, config.chainId);
      if (cursors.get(CURSOR_STREAM_PONS_TRANSFERS)) {
        const transferCatch = await catchUpTransferCursor({
          rpc,
          supabase,
          chainId: config.chainId,
          factories,
          memory,
          startupRewind: true,
          maxRanges: once ? 1 : undefined,
          productionStartBlock,
          observationStartBlock,
          onFactoryInserted: onLaunch,
        });
        latestChainBlock = transferCatch.head;
        latestProcessedBlock = highestProcessed(
          (
            await loadKnownCursors(supabase, config.chainId)
          ).get(CURSOR_STREAM_PONS_FACTORIES)?.lastProcessedBlock,
          transferCatch.lastProcessedBlock,
        );
        workerLog(
          `transfer catch-up: newBuyers=${transferCatch.newFirstBuyers} ranges=${transferCatch.rangesScanned} blocked=${transferCatch.blocked} fired=${transferCatch.lifecycle?.fired ?? 0} expired=${transferCatch.lifecycle?.expired ?? 0}`,
        );
      } else {
        workerLog(
          "no pons_transfers cursor — transfer scan idle until bootstrap",
        );
      }

      // POOLS Instant discovery is isolated: failure must not block PONS.
      // Continuous mode: one Instant range then one swap range, then return so
      // the 3s PONS poll can start. Do not await Instant/swaps until head.
      const poolsCatch = await catchUpPoolsInstantCursorIsolated({
        rpc,
        supabase,
        chainId: config.chainId,
        startupRewind: true,
        maxRanges: POOLS_CATCH_UP_MAX_RANGES_PER_CYCLE,
        productionStartBlock,
        observationStartBlock,
        onPersisted: onPoolsLaunch,
      });
      if (poolsCatch) {
        workerLog(
          `pools instant catch-up: inserted=${poolsCatch.inserted} known=${poolsCatch.alreadyKnown} ranges=${poolsCatch.rangesScanned} blocked=${poolsCatch.blocked}`,
        );
      }

      const poolsSwapCatch = await catchUpPoolsSwapCursorIsolated({
        rpc,
        supabase,
        chainId: config.chainId,
        memory: poolsMemory,
        startupRewind: true,
        maxRanges: POOLS_CATCH_UP_MAX_RANGES_PER_CYCLE,
        productionStartBlock,
        observationStartBlock,
        onInstantPersisted: onPoolsLaunch,
      });
      if (poolsSwapCatch) {
        workerLog(
          `pools swaps catch-up: newBuyers=${poolsSwapCatch.newFirstBuyers} ranges=${poolsSwapCatch.rangesScanned} blocked=${poolsSwapCatch.blocked}`,
        );
      }

      const feeCatch = await catchUpPonsV2CurveFeesCursorIsolated({
        rpc,
        supabase,
        chainId: config.chainId,
        factories,
        index: feeIndex,
        startupRewind: true,
        maxRanges: PONS_V2_FEE_CATCH_UP_MAX_RANGES_PER_CYCLE,
        productionStartBlock,
        observationStartBlock,
        onFactoryInserted: onLaunch,
      });
      if (feeCatch) {
        workerLog(
          `pons v2 fee catch-up: inserted=${feeCatch.inserted} duplicates=${feeCatch.skippedDuplicates} ranges=${feeCatch.rangesScanned} blocked=${feeCatch.blocked} curves=${feeIndex.byCurve.size}`,
        );
      }

      cursors = await loadKnownCursors(supabase, config.chainId);
      latestProcessedBlock = highestProcessed(
        cursors.get(CURSOR_STREAM_PONS_FACTORIES)?.lastProcessedBlock,
        cursors.get(CURSOR_STREAM_PONS_TRANSFERS)?.lastProcessedBlock,
      );
    },
  });

  await writeHeartbeat(supabase, memory, {
    latestChainBlock,
    latestProcessedBlock,
  });
  workerLog("worker_health upserted");

  if (once) {
    workerLog("once mode — exiting after boot + catch-up");
    return;
  }

  workerLog(
    `poll every ${FACTORY_POLL_INTERVAL_MS / 1000}s; heartbeat every ${HEARTBEAT_INTERVAL_MS / 1000}s`,
  );

  let shuttingDown = false;
  let pollBusy = false;

  const pollTimer = setInterval(() => {
    void (async () => {
      if (shuttingDown || pollBusy) return;
      pollBusy = true;
      try {
        if (
          (await loadKnownCursors(supabase, config.chainId)).get(
            CURSOR_STREAM_PONS_FACTORIES,
          )
        ) {
          const f = await catchUpFactoryCursor({
            rpc,
            supabase,
            chainId: config.chainId,
            factories,
            startupRewind: false,
            productionStartBlock,
            observationStartBlock,
            onInserted: onLaunch,
          });
          latestChainBlock = f.head;
        }

        if (
          (await loadKnownCursors(supabase, config.chainId)).get(
            CURSOR_STREAM_PONS_TRANSFERS,
          )
        ) {
          const t = await catchUpTransferCursor({
            rpc,
            supabase,
            chainId: config.chainId,
            factories,
            memory,
            startupRewind: false,
            productionStartBlock,
            observationStartBlock,
            onFactoryInserted: onLaunch,
          });
          latestChainBlock = t.head;
          if (
            t.lifecycle &&
            (t.lifecycle.fired > 0 ||
              t.lifecycle.expired > 0 ||
              t.lifecycle.fireOperationalFailures > 0)
          ) {
            workerLog(
              `poll lifecycle fired=${t.lifecycle.fired} expired=${t.lifecycle.expired} fireFail=${t.lifecycle.fireOperationalFailures}`,
            );
          }
        }

        const now = await loadKnownCursors(supabase, config.chainId);
        latestProcessedBlock = highestProcessed(
          now.get(CURSOR_STREAM_PONS_FACTORIES)?.lastProcessedBlock,
          now.get(CURSOR_STREAM_PONS_TRANSFERS)?.lastProcessedBlock,
        );

        await catchUpPoolsInstantCursorIsolated({
          rpc,
          supabase,
          chainId: config.chainId,
          startupRewind: false,
          maxRanges: POOLS_CATCH_UP_MAX_RANGES_PER_CYCLE,
          productionStartBlock,
          observationStartBlock,
          onPersisted: onPoolsLaunch,
        });
        await catchUpPoolsSwapCursorIsolated({
          rpc,
          supabase,
          chainId: config.chainId,
          memory: poolsMemory,
          startupRewind: false,
          maxRanges: POOLS_CATCH_UP_MAX_RANGES_PER_CYCLE,
          productionStartBlock,
          observationStartBlock,
          onInstantPersisted: onPoolsLaunch,
        });
        await catchUpPonsV2CurveFeesCursorIsolated({
          rpc,
          supabase,
          chainId: config.chainId,
          factories,
          index: feeIndex,
          startupRewind: false,
          maxRanges: PONS_V2_FEE_CATCH_UP_MAX_RANGES_PER_CYCLE,
          productionStartBlock,
          observationStartBlock,
          onFactoryInserted: onLaunch,
        });
      } catch (error) {
        workerError("poll cycle failed", error);
      } finally {
        pollBusy = false;
      }
    })();
  }, FACTORY_POLL_INTERVAL_MS);

  const heartbeatTimer = setInterval(() => {
    void (async () => {
      if (shuttingDown) return;
      try {
        await writeHeartbeat(supabase, memory, {
          latestChainBlock,
          latestProcessedBlock,
        });
        workerLog(
          `heartbeat head=${latestChainBlock ?? "null"} processed=${latestProcessedBlock ?? "null"} active=${activeTokenCount(memory)}`,
        );
      } catch (error) {
        workerError("heartbeat failed", error);
      }
    })();
  }, HEARTBEAT_INTERVAL_MS);

  await new Promise<void>((resolve) => {
    const shutdown = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      workerLog(`shutting down (${signal})`);
      clearInterval(pollTimer);
      clearInterval(heartbeatTimer);
      try {
        await writeHeartbeat(supabase, memory, {
          latestChainBlock,
          latestProcessedBlock,
        });
        workerLog("final heartbeat written");
      } catch (error) {
        workerError("final heartbeat failed", error);
      }
      resolve();
    };

    process.on("SIGINT", () => {
      void shutdown("SIGINT");
    });
    process.on("SIGTERM", () => {
      void shutdown("SIGTERM");
    });
  });
}

main().catch((error: unknown) => {
  workerError("fatal", error);
  process.exit(1);
});
