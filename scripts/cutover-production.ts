/**
 * One-time production cutover operator.
 *
 * Dry-run (default):
 *   npm run worker:cutover-production -- --from-head
 *   npm run worker:cutover-production -- --from-block 33990000
 *
 * Apply (review required):
 *   npm run worker:cutover-production -- --from-head --confirm
 *
 * Does NOT rewrite production_start_block if already set (no --force).
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadDotenv({ path: resolve(process.cwd(), ".env"), quiet: true });

import { loadWorkerConfig } from "@/lib/worker/config";
import { createChainRpc } from "@/lib/worker/chain/rpc";
import {
  buildCutoverPlan,
  parseCutoverArgs,
  shouldMutateCutover,
} from "@/lib/worker/cutover-plan";
import { workerError, workerLog } from "@/lib/worker/log";
import {
  formatDurableStateReport,
  inspectDurableState,
} from "@/lib/worker/repositories/inspect";
import {
  callPerformProductionCutover,
  loadProductionState,
} from "@/lib/worker/repositories/production-state";
import {
  createWorkerSupabase,
  proveSupabaseConnectivity,
} from "@/lib/worker/supabase";

async function main(): Promise<void> {
  const parsed = parseCutoverArgs(process.argv.slice(2));
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  const config = loadWorkerConfig();
  workerLog(`chain_id=${config.chainId}`);

  const supabase = createWorkerSupabase(config);
  await proveSupabaseConnectivity(supabase);
  workerLog("supabase connected");

  const rpc = createChainRpc(config.alchemyRpcUrl);
  const head = await rpc.getBlockNumber();
  workerLog(`alchemy head=${head}`);

  let productionStartBlock: number;
  if (parsed.mode.kind === "from_head") {
    productionStartBlock = head;
    workerLog(
      "mode=--from-head → production boundary B = current chain head (observe launches after this block)",
    );
  } else {
    productionStartBlock = parsed.mode.block;
    if (productionStartBlock > head) {
      throw new Error(
        `chosen --from-block ${productionStartBlock} is beyond head ${head}`,
      );
    }
    workerLog(`mode=--from-block → production boundary B=${productionStartBlock}`);
  }

  const existing = await loadProductionState(supabase, config.chainId);
  const before = await inspectDurableState(supabase, config.chainId);

  workerLog("--- current durable state ---");
  for (const line of formatDurableStateReport(before, { chainHead: head })) {
    workerLog(line);
  }

  const plan = buildCutoverPlan(productionStartBlock);
  workerLog("--- intended cutover plan ---");
  workerLog(`production_start_block B=${plan.productionStartBlock}`);
  workerLog(`cutover_version=${plan.cutoverVersion}`);
  workerLog(`cursor alignment last_processed_block=${plan.cursorLastProcessedBlock}`);
  workerLog(
    `first exclusive production block=${plan.firstExclusiveProductionBlock}`,
  );
  workerLog(`launch eligibility=${plan.launchEligibility}`);
  workerLog(
    `dev ACTIVE rows ≤ B (excluded from production watch by filter, not deleted)=${before.preBoundaryActiveCount}`,
  );
  for (const m of plan.mutations) {
    workerLog(`  WOULD: ${m}`);
  }

  if (existing) {
    workerLog(
      `REFUSE: production cutover already exists (B=${existing.productionStartBlock}, version=${existing.cutoverVersion}). No rewrite path in this command.`,
    );
    process.exitCode = 2;
    return;
  }

  if (!shouldMutateCutover(parsed.confirm)) {
    workerLog(
      "DRY RUN only — no mutations. Re-run with --confirm after operator review to apply.",
    );
    return;
  }

  workerLog("applying atomic perform_production_cutover …");
  const result = await callPerformProductionCutover(supabase, {
    chainId: config.chainId,
    productionStartBlock,
  });

  if (result.status === "already_cutover") {
    workerLog(
      `REFUSE: race/already cutover B=${result.productionStartBlock}`,
    );
    process.exitCode = 2;
    return;
  }

  if (result.status !== "cutover_applied") {
    throw new Error(
      `cutover failed: status=${result.status} reason=${result.reason ?? "unknown"}`,
    );
  }

  workerLog(
    `CUTOVER APPLIED B=${result.productionStartBlock} factories=${result.cursors?.pons_factories} transfers=${result.cursors?.pons_transfers}`,
  );

  const after = await inspectDurableState(supabase, config.chainId);
  workerLog("--- post-cutover durable state ---");
  for (const line of formatDurableStateReport(after, { chainHead: head })) {
    workerLog(line);
  }
}

main().catch((err: unknown) => {
  workerError("cutover-production failed", err);
  process.exit(1);
});
