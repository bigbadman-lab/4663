/**
 * Pre-deploy / pre-cutover readiness checks (no product mutations).
 *
 *   npm run worker:preflight
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadDotenv({ path: resolve(process.cwd(), ".env"), quiet: true });

import {
  CURSOR_STREAM_PONS_FACTORIES,
  CURSOR_STREAM_PONS_TRANSFERS,
} from "@/lib/pons/constants";
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
  let ok = true;
  const fail = (msg: string) => {
    ok = false;
    workerLog(`FAIL ${msg}`);
  };

  const config = loadWorkerConfig();
  workerLog(`chain_id=${config.chainId}`);
  workerLog("config OK (secrets not printed)");

  const supabase = createWorkerSupabase(config);
  await proveSupabaseConnectivity(supabase);
  workerLog("supabase reachable");

  const rpc = createChainRpc(config.alchemyRpcUrl);
  const head = await rpc.getBlockNumber();
  workerLog(`alchemy reachable head=${head}`);

  let snap;
  try {
    snap = await inspectDurableState(supabase, config.chainId);
  } catch (err) {
    fail(
      `inspect durable state: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
    return;
  }

  for (const line of formatDurableStateReport(snap, { chainHead: head })) {
    workerLog(line);
  }

  if (snap.productionStartBlock === null) {
    fail(
      "production cutover marker missing — run cutover dry-run then --confirm before Render",
    );
  } else {
    workerLog(
      `production mode ready B=${snap.productionStartBlock} version=${snap.cutoverVersion}`,
    );
  }

  if (snap.factoryCursor === null) {
    fail(`cursor ${CURSOR_STREAM_PONS_FACTORIES} missing`);
  }
  if (snap.transferCursor === null) {
    fail(`cursor ${CURSOR_STREAM_PONS_TRANSFERS} missing`);
  }

  if (
    snap.factoryCursor !== null &&
    snap.transferCursor !== null &&
    snap.productionStartBlock !== null
  ) {
    if (
      snap.factoryCursor === snap.productionStartBlock &&
      snap.transferCursor === snap.productionStartBlock
    ) {
      workerLog("cursors aligned to production_start_block (initial cutover)");
    } else if (snap.factoryCursor === snap.transferCursor) {
      workerLog(
        `cursors equal at ${snap.factoryCursor} (may diverge after live processing)`,
      );
    } else {
      workerLog(
        `INFO cursors diverge factories=${snap.factoryCursor} transfers=${snap.transferCursor} (expected once live if factories lead slightly)`,
      );
    }
  }

  if (snap.workerHealth) {
    workerLog("worker_health table reachable");
  } else {
    workerLog("INFO worker_health row not yet present (first boot will upsert)");
  }

  if (ok) {
    workerLog("PREFLIGHT PASS");
  } else {
    workerLog("PREFLIGHT FAIL");
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  workerError("preflight failed", err);
  process.exit(1);
});
