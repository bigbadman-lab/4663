/**
 * Standalone persistent worker.
 *
 * Stage 5 pipeline:
 *   factories first → transfers for ACTIVE tokens → first buyers
 * No rolling event emission.
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadDotenv({ path: resolve(process.cwd(), ".env"), quiet: true });

import {
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
} from "@/lib/worker/constants";
import { prepareStartupCursors } from "@/lib/worker/cursor-runtime";
import { workerError, workerLog } from "@/lib/worker/log";
import { catchUpFactoryCursor } from "@/lib/worker/pons/factory-loop";
import { catchUpTransferCursor } from "@/lib/worker/pons/transfer-loop";
import { loadKnownCursors } from "@/lib/worker/repositories/cursors";
import { loadFirstBuyersForTokens } from "@/lib/worker/repositories/first-buyers";
import { loadActiveLaunches } from "@/lib/worker/repositories/launches";
import { upsertWorkerHealth } from "@/lib/worker/repositories/worker-health";
import {
  activeTokenCount,
  addActiveLaunchToMemory,
  reconstructWorkerMemory,
} from "@/lib/worker/state";
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

  workerLog("starting");
  workerLog(`worker_name=${WORKER_NAME}`);

  const config = loadWorkerConfig();
  workerLog(`chain_id=${config.chainId}`);

  const supabase = createWorkerSupabase(config);
  await proveSupabaseConnectivity(supabase);
  workerLog("supabase connected");

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

  const launches = await loadActiveLaunches(supabase, config.chainId);
  const tokenAddresses = launches.map((l) => l.tokenAddress);
  const firstBuyers = await loadFirstBuyersForTokens(
    supabase,
    config.chainId,
    tokenAddresses,
  );

  const memory = reconstructWorkerMemory(launches, firstBuyers);
  workerLog(`active tokens: ${activeTokenCount(memory)}`);
  workerLog(`first buyers loaded: ${firstBuyers.length}`);

  let latestChainBlock: number | null = null;
  let latestProcessedBlock = highestProcessed(
    cursors.get(CURSOR_STREAM_PONS_FACTORIES)?.lastProcessedBlock,
    cursors.get(CURSOR_STREAM_PONS_TRANSFERS)?.lastProcessedBlock,
  );

  try {
    latestChainBlock = await rpc.getBlockNumber();
    workerLog(`chain head: ${latestChainBlock}`);
  } catch (error) {
    workerError("initial eth_blockNumber failed", error);
  }

  const onLaunch = (launch: {
    tokenAddress: string;
    marketAddress: string;
    factoryAddress: string;
    factoryVersion: "v1" | "v2";
    launchTxHash: string;
    launchBlockNumber: number;
    launchBlockTimestampIso: string;
  }) => {
    addActiveLaunchToMemory(memory, launch);
  };

  // 1) Factory catch-up first (discover launches before transfer range work).
  if (cursors.get(CURSOR_STREAM_PONS_FACTORIES)) {
    const catchUp = await catchUpFactoryCursor({
      rpc,
      supabase,
      chainId: config.chainId,
      factories,
      startupRewind: true,
      maxRanges: once ? 1 : undefined,
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
    workerLog("no pons_transfers cursor — transfer scan idle until bootstrap");
  }

  cursors = await loadKnownCursors(supabase, config.chainId);
  latestProcessedBlock = highestProcessed(
    cursors.get(CURSOR_STREAM_PONS_FACTORIES)?.lastProcessedBlock,
    cursors.get(CURSOR_STREAM_PONS_TRANSFERS)?.lastProcessedBlock,
  );

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
        // Factories first, then transfers.
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
