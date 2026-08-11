/**
 * Read-only durable state report (Stage 7A audit).
 *
 *   npm run worker:inspect-state
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadDotenv({ path: resolve(process.cwd(), ".env"), quiet: true });

import { loadWorkerConfig } from "@/lib/worker/config";
import { createChainRpc } from "@/lib/worker/chain/rpc";
import { workerError, workerLog } from "@/lib/worker/log";
import {
  formatDurableStateReport,
  inspectDurableState,
} from "@/lib/worker/repositories/inspect";
import {
  createWorkerSupabase,
  proveSupabaseConnectivity,
} from "@/lib/worker/supabase";

async function main(): Promise<void> {
  const config = loadWorkerConfig();
  const supabase = createWorkerSupabase(config);
  await proveSupabaseConnectivity(supabase);
  const rpc = createChainRpc(config.alchemyRpcUrl);
  let head: number | null = null;
  try {
    head = await rpc.getBlockNumber();
  } catch {
    workerLog("alchemy head unavailable");
  }

  const snap = await inspectDurableState(supabase, config.chainId);
  for (const line of formatDurableStateReport(snap, { chainHead: head })) {
    workerLog(line);
  }
}

main().catch((err: unknown) => {
  workerError("inspect-state failed", err);
  process.exit(1);
});
