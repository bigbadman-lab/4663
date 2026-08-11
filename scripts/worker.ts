/**
 * Standalone persistent worker entrypoint (Stage 3 foundation).
 *
 * Boots against Supabase, reconstructs ACTIVE runtime state, heartbeats,
 * and waits. No Alchemy / chain scanning.
 *
 * Local:
 *   npm run worker
 *   npm run worker:once   # boot + single health write, then exit
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

// Load .env.local before any config reads (Next-style local secrets).
loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
// Optional fallback for plain .env if someone uses that layout.
loadDotenv({ path: resolve(process.cwd(), ".env"), quiet: true });

import {
  CURSOR_STREAM_PONS_FACTORIES,
  CURSOR_STREAM_PONS_TRANSFERS,
  WORKER_NAME,
} from "@/lib/pons/constants";
import { loadWorkerConfig } from "@/lib/worker/config";
import { HEARTBEAT_INTERVAL_MS } from "@/lib/worker/constants";
import { prepareStartupCursors } from "@/lib/worker/cursor-runtime";
import { workerError, workerLog } from "@/lib/worker/log";
import {
  highestLastProcessedBlock,
  loadKnownCursors,
} from "@/lib/worker/repositories/cursors";
import { loadFirstBuyersForTokens } from "@/lib/worker/repositories/first-buyers";
import { loadActiveLaunches } from "@/lib/worker/repositories/launches";
import { upsertWorkerHealth } from "@/lib/worker/repositories/worker-health";
import { activeTokenCount, reconstructWorkerMemory } from "@/lib/worker/state";
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
  cursors: Map<CursorStreamName, CursorRow | null>,
): Promise<void> {
  await upsertWorkerHealth(supabase, {
    lastHeartbeatAt: new Date().toISOString(),
    latestChainBlock: null,
    latestProcessedBlock: highestLastProcessedBlock(cursors),
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

  const cursors = await loadKnownCursors(supabase, config.chainId);
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

  // Reference known stream constants so future stages wire both streams.
  void CURSOR_STREAM_PONS_FACTORIES;
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

  await writeHeartbeat(supabase, memory, cursors);
  workerLog("worker_health upserted");

  if (once) {
    workerLog("once mode — exiting after successful boot");
    return;
  }

  workerLog(
    `heartbeat every ${HEARTBEAT_INTERVAL_MS / 1000}s — waiting (SIGINT/SIGTERM to stop)`,
  );

  let shuttingDown = false;

  const timer = setInterval(() => {
    void (async () => {
      if (shuttingDown) return;
      try {
        await writeHeartbeat(supabase, memory, cursors);
        workerLog("heartbeat");
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
      clearInterval(timer);
      try {
        await writeHeartbeat(supabase, memory, cursors);
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
