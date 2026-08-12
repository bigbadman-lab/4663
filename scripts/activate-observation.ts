/**
 * Forward-observation activation operator.
 *
 * Dry-run (default — NEVER mutates):
 *   npm run worker:activate-observation
 *   npm run worker:activate-observation -- --block <X>
 *
 * Apply (explicit only):
 *   npm run worker:activate-observation -- --block <X> --confirm
 *
 * Requires Render worker PAUSED (stale worker_health heartbeat).
 * Does NOT rewrite production_start_block.
 * Does NOT restart Render.
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadDotenv({ path: resolve(process.cwd(), ".env"), quiet: true });

import { CHAIN_ID } from "@/lib/pons/constants";
import {
  buildObservationActivationPlan,
  describeWorkerHeartbeatStatus,
  evaluateActivationGuards,
  parseActivateObservationArgs,
  shouldMutateObservationActivation,
  verifyObservationActivationReadback,
  WORKER_HEARTBEAT_STALE_AFTER_MS,
} from "@/lib/worker/activate-observation-plan";
import { loadWorkerConfig } from "@/lib/worker/config";
import { createChainRpc } from "@/lib/worker/chain/rpc";
import { workerError, workerLog } from "@/lib/worker/log";
import {
  callActivateForwardObservation,
  FORWARD_OBSERVATION_VERSION,
} from "@/lib/worker/observation-activation";
import {
  formatDurableStateReport,
  inspectDurableState,
} from "@/lib/worker/repositories/inspect";
import {
  createWorkerSupabase,
  proveSupabaseConnectivity,
} from "@/lib/worker/supabase";

async function main(): Promise<void> {
  const parsed = parseActivateObservationArgs(process.argv.slice(2));
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  const mutate = shouldMutateObservationActivation(parsed);
  workerLog(mutate ? "APPLY MODE (explicit --block + --confirm)" : "DRY RUN");

  const config = loadWorkerConfig();
  workerLog(`configured_chain_id=${config.chainId}`);

  if (config.chainId !== CHAIN_ID) {
    throw new Error(
      `wrong chain: configured chain_id=${config.chainId} expected=${CHAIN_ID}`,
    );
  }

  const supabase = createWorkerSupabase(config);
  await proveSupabaseConnectivity(supabase);
  workerLog("supabase connected");

  const rpc = createChainRpc(config.alchemyRpcUrl);
  const head = await rpc.getBlockNumber();
  workerLog(`rpc_head=${head}`);

  const before = await inspectDurableState(supabase, config.chainId);
  const nowMs = Date.now();
  const heartbeat = before.workerHealth?.lastHeartbeatAt ?? null;
  const workerStatus = describeWorkerHeartbeatStatus({
    workerHeartbeatAt: heartbeat,
    nowMs,
  });

  workerLog("--- current durable state ---");
  for (const line of formatDurableStateReport(before, { chainHead: head })) {
    workerLog(line);
  }
  workerLog(`worker_heartbeat=${heartbeat ?? "NONE"}`);
  workerLog(`worker_status=${workerStatus}`);
  workerLog(
    `heartbeat_stale_after_ms=${WORKER_HEARTBEAT_STALE_AFTER_MS} (refuse if newer)`,
  );

  const proposedX = parsed.block ?? head;
  if (parsed.block === null) {
    workerLog(
      `proposed_observation_start_block=X=${proposedX} (from current RPC head; supply --block <X> --confirm to apply this exact value)`,
    );
  } else {
    workerLog(`proposed_observation_start_block=X=${proposedX} (from --block)`);
  }

  const plan = buildObservationActivationPlan(proposedX);
  workerLog("--- intended activation plan ---");
  workerLog(`observation_start_block X=${plan.observationStartBlock}`);
  workerLog(`observation_version=${plan.observationVersion}`);
  workerLog(`proposed_factory_cursor=${plan.proposedFactoryCursor}`);
  workerLog(`proposed_transfer_cursor=${plan.proposedTransferCursor}`);
  workerLog(`launch_eligibility=${plan.launchEligibility}`);
  workerLog(
    `current_factory_cursor=${before.factoryCursor ?? "NONE"}`,
  );
  workerLog(
    `current_transfer_cursor=${before.transferCursor ?? "NONE"}`,
  );
  for (const m of plan.mutations) {
    workerLog(`  WOULD: ${m}`);
  }

  workerLog("--- Stage 11B manual preflight (not automated here) ---");
  workerLog(
    "Before production apply, confirm in Supabase SQL Editor: events_event_type_check allows pons_buyer_continuation; fire_pons_buyer_continuation exists; events_token_event_unique exists; service_role EXECUTE granted.",
  );

  const guards = evaluateActivationGuards({
    configuredChainId: config.chainId,
    expectedChainId: CHAIN_ID,
    productionStartBlock: before.productionStartBlock,
    observationStartBlock: before.observationStartBlock,
    factoryCursor: before.factoryCursor,
    transferCursor: before.transferCursor,
    proposedX,
    currentHead: head,
    workerHeartbeatAt: heartbeat,
    nowMs,
  });

  for (const w of guards.warnings) {
    workerLog(`WARNING: ${w}`);
  }

  if (!guards.ok) {
    workerLog(`REFUSE: ${guards.reason}`);
    process.exitCode = 2;
    return;
  }

  if (!mutate) {
    workerLog("NO CHANGES APPLIED");
    workerLog(
      "DRY RUN only — re-run with --block <X> --confirm after Render is paused and Stage 11B is verified.",
    );
    return;
  }

  // Apply path: re-check head for reporting only; never replace supplied X.
  const headAtApply = await rpc.getBlockNumber();
  workerLog(`rpc_head_at_apply=${headAtApply}`);
  if (parsed.block! > headAtApply) {
    workerLog(
      `REFUSE: supplied X=${parsed.block} is beyond current RPC head=${headAtApply}`,
    );
    process.exitCode = 2;
    return;
  }
  if (parsed.block! < headAtApply) {
    workerLog(
      `WARNING: supplied X is behind head by ${headAtApply - parsed.block!} blocks`,
    );
  }

  const mid = await inspectDurableState(supabase, config.chainId);
  const midGuards = evaluateActivationGuards({
    configuredChainId: config.chainId,
    expectedChainId: CHAIN_ID,
    productionStartBlock: mid.productionStartBlock,
    observationStartBlock: mid.observationStartBlock,
    factoryCursor: mid.factoryCursor,
    transferCursor: mid.transferCursor,
    proposedX: parsed.block!,
    currentHead: headAtApply,
    workerHeartbeatAt: mid.workerHealth?.lastHeartbeatAt ?? null,
    nowMs: Date.now(),
  });
  if (!midGuards.ok) {
    workerLog(`REFUSE (re-check): ${midGuards.reason}`);
    process.exitCode = 2;
    return;
  }

  const productionBefore = mid.productionStartBlock;
  if (productionBefore === null) {
    workerLog("REFUSE: missing production_start_block on re-check");
    process.exitCode = 2;
    return;
  }

  workerLog(
    `calling activate_forward_observation X=${parsed.block} version=${FORWARD_OBSERVATION_VERSION} …`,
  );
  const result = await callActivateForwardObservation(supabase, {
    chainId: config.chainId,
    observationStartBlock: parsed.block!,
    observationVersion: FORWARD_OBSERVATION_VERSION,
  });

  if (result.status === "already_activated") {
    workerLog(
      `REFUSE: already_activated observation_start_block=${result.observationStartBlock}`,
    );
    process.exitCode = 2;
    return;
  }

  if (result.status !== "activated") {
    workerLog(
      `REFUSE: activation failed status=${result.status} reason=${result.reason ?? "unknown"} detail=${result.detail ?? ""}`,
    );
    process.exitCode = 2;
    return;
  }

  workerLog(
    `RPC activated X=${result.observationStartBlock} version=${result.observationVersion} factories=${result.cursors?.pons_factories} transfers=${result.cursors?.pons_transfers}`,
  );
  workerLog(
    `rollback_cursors factories=${result.rollbackCursors?.pons_factories} transfers=${result.rollbackCursors?.pons_transfers}`,
  );
  workerLog(`production_start_block=${result.productionStartBlock}`);

  const after = await inspectDurableState(supabase, config.chainId);
  workerLog("--- post-activation durable state ---");
  for (const line of formatDurableStateReport(after, {
    chainHead: headAtApply,
  })) {
    workerLog(line);
  }

  const verified = verifyObservationActivationReadback({
    productionStartBlockBefore: productionBefore,
    observationStartBlock: after.observationStartBlock,
    factoryCursor: after.factoryCursor,
    transferCursor: after.transferCursor,
    expectedX: parsed.block!,
    productionStartBlockAfter: after.productionStartBlock,
  });

  if (!verified.ok) {
    workerLog("HIGH-SEVERITY: post-activation verification FAILED");
    for (const f of verified.failures) {
      workerLog(`  FAIL: ${f}`);
    }
    process.exitCode = 3;
    return;
  }

  workerLog("post-activation verification OK");
  workerLog("OBSERVATION ACTIVATED");
  workerLog("DO NOT START SOCIAL WORK");
  workerLog(
    "NEXT: verify state, then resume worker for prospective PONS observation",
  );
}

main().catch((err: unknown) => {
  workerError("activate-observation failed", err);
  process.exit(1);
});
