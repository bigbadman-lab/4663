/**
 * Standalone persistent worker entrypoint.
 *
 * Stage 4: after pons_factories cursor bootstrap, polls chain head and
 * discovers PONS launches. No Transfer / PonsBuy scanning.
 *
 * Local:
 *   npm run worker
 *   npm run worker:once
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
import {
  loadKnownCursors,
} from "@/lib/worker/repositories/cursors";
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
  const startupPlans = prepareStartupCursors(cursors);

  for (const plan of startupPlans) {
    workerLog(
      formatCursorLog(
        plan.streamName,
        cursors.get(plan.streamName) ?? null,
        plan.startupFromBlock,
      ),
    );
  }

  void CURSOR_STREAM_PONS_TRANSFERS;

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
  let latestProcessedBlock =
    cursors.get(CURSOR_STREAM_PONS_FACTORIES)?.lastProcessedBlock ?? null;

  try {
    latestChainBlock = await rpc.getBlockNumber();
    workerLog(`chain head: ${latestChainBlock}`);
  } catch (error) {
    workerError("initial eth_blockNumber failed", error);
  }

  // First catch-up with startup rewind if factories cursor exists.
  if (cursors.get(CURSOR_STREAM_PONS_FACTORIES)) {
    const catchUp = await catchUpFactoryCursor({
      rpc,
      supabase,
      chainId: config.chainId,
      factories,
      startupRewind: true,
      // once-mode: one outer range only so smoke cannot run for hours when far behind head
      maxRanges: once ? 1 : undefined,
      onInserted: (launch) => {
        addActiveLaunchToMemory(memory, {
          tokenAddress: launch.tokenAddress,
          marketAddress: launch.marketAddress,
          factoryAddress: launch.factoryAddress,
          factoryVersion: launch.factoryVersion,
          launchTxHash: launch.launchTxHash,
          launchBlockNumber: launch.launchBlockNumber,
          launchBlockTimestampIso: launch.launchBlockTimestampIso,
        });
      },
    });
    latestChainBlock = catchUp.head;
    if (catchUp.lastProcessedBlock !== null) {
      latestProcessedBlock = catchUp.lastProcessedBlock;
    }
    workerLog(
      `factory catch-up: inserted=${catchUp.inserted} known=${catchUp.alreadyKnown} ranges=${catchUp.rangesScanned} blocked=${catchUp.blocked}`,
    );
    workerLog(`active tokens: ${activeTokenCount(memory)}`);
  } else {
    workerLog(
      "no pons_factories cursor — discovery idle until bootstrap (npm run worker:bootstrap-factories)",
    );
  }

  cursors = await loadKnownCursors(supabase, config.chainId);
  latestProcessedBlock =
    cursors.get(CURSOR_STREAM_PONS_FACTORIES)?.lastProcessedBlock ??
    latestProcessedBlock;

  await writeHeartbeat(supabase, memory, {
    latestChainBlock,
    latestProcessedBlock,
  });
  workerLog("worker_health upserted");

  if (once) {
    workerLog("once mode — exiting after boot + factory catch-up");
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
        const cursorsNow = await loadKnownCursors(supabase, config.chainId);
        if (!cursorsNow.get(CURSOR_STREAM_PONS_FACTORIES)) {
          latestChainBlock = await rpc.getBlockNumber();
          return;
        }

        const catchUp = await catchUpFactoryCursor({
          rpc,
          supabase,
          chainId: config.chainId,
          factories,
          startupRewind: false,
          onInserted: (launch) => {
            addActiveLaunchToMemory(memory, {
              tokenAddress: launch.tokenAddress,
              marketAddress: launch.marketAddress,
              factoryAddress: launch.factoryAddress,
              factoryVersion: launch.factoryVersion,
              launchTxHash: launch.launchTxHash,
              launchBlockNumber: launch.launchBlockNumber,
              launchBlockTimestampIso: launch.launchBlockTimestampIso,
            });
          },
        });
        latestChainBlock = catchUp.head;
        if (catchUp.lastProcessedBlock !== null) {
          latestProcessedBlock = catchUp.lastProcessedBlock;
        }
      } catch (error) {
        workerError("factory poll failed", error);
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
