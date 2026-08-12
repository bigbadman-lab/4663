/**
 * Pure argument / safety helpers for forward-observation activation operator.
 */

import { CHAIN_ID } from "@/lib/pons/constants";
import { HEARTBEAT_INTERVAL_MS } from "@/lib/worker/constants";
import {
  FORWARD_OBSERVATION_VERSION,
  isValidObservationBoundary,
  observationCursorTargetBlock,
} from "@/lib/worker/observation-activation";

/** Refuse activation if worker heartbeat is newer than this (4× heartbeat interval). */
export const WORKER_HEARTBEAT_STALE_AFTER_MS = HEARTBEAT_INTERVAL_MS * 4;

export type ParseActivateObservationArgsResult =
  | {
      ok: true;
      /** Exact block for apply; null on dry-run without --block */
      block: number | null;
      confirm: boolean;
    }
  | { ok: false; error: string };

/**
 * Parse operator argv.
 *
 * Dry-run (default): no --confirm
 * Apply: requires both --block <X> and --confirm
 */
export function parseActivateObservationArgs(
  argv: string[],
): ParseActivateObservationArgsResult {
  let block: number | null = null;
  let confirm = false;
  let sawBlockFlag = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--confirm") {
      confirm = true;
      continue;
    }
    if (a === "--block") {
      sawBlockFlag = true;
      const raw = argv[++i];
      if (raw === undefined) {
        return { ok: false, error: "--block requires an integer" };
      }
      const v = Number(raw);
      if (!Number.isInteger(v) || v < 1) {
        return {
          ok: false,
          error: "--block requires an integer >= 1",
        };
      }
      block = v;
      continue;
    }
    return { ok: false, error: `unknown argument: ${a}` };
  }

  if (confirm && block === null) {
    return {
      ok: false,
      error:
        "activation requires both --block <X> and --confirm (exact block must be supplied)",
    };
  }

  if (sawBlockFlag && block === null) {
    return { ok: false, error: "--block requires an integer >= 1" };
  }

  return { ok: true, block, confirm };
}

/** True only when operator supplied both --block and --confirm. */
export function shouldMutateObservationActivation(input: {
  block: number | null;
  confirm: boolean;
}): boolean {
  return input.confirm === true && input.block !== null;
}

export type ActivationGuardInput = {
  configuredChainId: number;
  expectedChainId?: number;
  productionStartBlock: number | null;
  observationStartBlock: number | null;
  factoryCursor: number | null;
  transferCursor: number | null;
  proposedX: number;
  currentHead: number;
  workerHeartbeatAt: string | null;
  nowMs: number;
  heartbeatStaleAfterMs?: number;
};

export type ActivationGuardResult =
  | { ok: true; warnings: string[] }
  | { ok: false; reason: string; warnings: string[] };

export function evaluateActivationGuards(
  input: ActivationGuardInput,
): ActivationGuardResult {
  const expected = input.expectedChainId ?? CHAIN_ID;
  const warnings: string[] = [];
  const staleAfter =
    input.heartbeatStaleAfterMs ?? WORKER_HEARTBEAT_STALE_AFTER_MS;

  if (input.configuredChainId !== expected) {
    return {
      ok: false,
      reason: `wrong chain: configured chain_id=${input.configuredChainId} expected=${expected}`,
      warnings,
    };
  }

  if (input.productionStartBlock === null) {
    return {
      ok: false,
      reason: "missing_production_cutover",
      warnings,
    };
  }

  if (input.observationStartBlock !== null) {
    return {
      ok: false,
      reason: `observation already active (observation_start_block=${input.observationStartBlock})`,
      warnings,
    };
  }

  if (!Number.isInteger(input.proposedX) || input.proposedX < 1) {
    return {
      ok: false,
      reason: "invalid_boundary: X must be an integer >= 1",
      warnings,
    };
  }

  if (
    !isValidObservationBoundary(input.proposedX, input.productionStartBlock)
  ) {
    return {
      ok: false,
      reason: `invalid_boundary: X=${input.proposedX} must be > production_start_block=${input.productionStartBlock}`,
      warnings,
    };
  }

  if (input.factoryCursor === null || input.transferCursor === null) {
    return {
      ok: false,
      reason: "missing_cursors: pons_factories and pons_transfers are required",
      warnings,
    };
  }

  if (input.proposedX > input.currentHead) {
    return {
      ok: false,
      reason: `invalid_boundary: X=${input.proposedX} is beyond current RPC head=${input.currentHead}`,
      warnings,
    };
  }

  if (input.proposedX < input.currentHead) {
    warnings.push(
      `proposed X is behind head by ${input.currentHead - input.proposedX} blocks (worker will catch up sequentially)`,
    );
  }

  if (input.workerHeartbeatAt === null) {
    return {
      ok: false,
      reason:
        "worker_health heartbeat missing/unavailable — pause Render and ensure worker is stopped before activation",
      warnings,
    };
  }

  const hbMs = Date.parse(input.workerHeartbeatAt);
  if (Number.isNaN(hbMs)) {
    return {
      ok: false,
      reason: `worker_health heartbeat unparseable: ${input.workerHeartbeatAt}`,
      warnings,
    };
  }

  const ageMs = input.nowMs - hbMs;
  if (ageMs < staleAfter) {
    return {
      ok: false,
      reason:
        `Worker heartbeat is recent (age_ms=${ageMs}, stale_after_ms=${staleAfter}). ` +
        "Pause Render and wait for worker heartbeat to become stale before activation.",
      warnings,
    };
  }

  return { ok: true, warnings };
}

export type ObservationActivationPlan = {
  observationStartBlock: number;
  observationVersion: typeof FORWARD_OBSERVATION_VERSION;
  proposedFactoryCursor: number;
  proposedTransferCursor: number;
  launchEligibility: string;
  mutations: string[];
};

export function buildObservationActivationPlan(
  observationStartBlock: number,
): ObservationActivationPlan {
  const cursor = observationCursorTargetBlock(observationStartBlock);
  return {
    observationStartBlock,
    observationVersion: FORWARD_OBSERVATION_VERSION,
    proposedFactoryCursor: cursor,
    proposedTransferCursor: cursor,
    launchEligibility: `launch_block_number >= ${observationStartBlock}`,
    mutations: [
      `RPC activate_forward_observation(chain_id=${CHAIN_ID}, X=${observationStartBlock}, version=${FORWARD_OBSERVATION_VERSION})`,
      `SET production_state.observation_start_block=${observationStartBlock} (via RPC)`,
      `SET pons_factories.last_processed_block=${cursor} (via RPC)`,
      `SET pons_transfers.last_processed_block=${cursor} (via RPC)`,
      "Snapshot current cursors into observation_rollback_* (via RPC)",
      "Does NOT mutate historical pons_launches / pons_first_buyers / events",
      "Does NOT change production_start_block",
    ],
  };
}

export type PostActivationVerificationInput = {
  productionStartBlockBefore: number;
  observationStartBlock: number | null;
  factoryCursor: number | null;
  transferCursor: number | null;
  expectedX: number;
  productionStartBlockAfter: number | null;
};

export type PostActivationVerificationResult =
  | { ok: true }
  | { ok: false; failures: string[] };

export function verifyObservationActivationReadback(
  input: PostActivationVerificationInput,
): PostActivationVerificationResult {
  const failures: string[] = [];
  const expectedCursor = observationCursorTargetBlock(input.expectedX);

  if (input.observationStartBlock !== input.expectedX) {
    failures.push(
      `observation_start_block expected=${input.expectedX} got=${input.observationStartBlock ?? "null"}`,
    );
  }
  if (input.factoryCursor !== expectedCursor) {
    failures.push(
      `pons_factories expected=${expectedCursor} got=${input.factoryCursor ?? "null"}`,
    );
  }
  if (input.transferCursor !== expectedCursor) {
    failures.push(
      `pons_transfers expected=${expectedCursor} got=${input.transferCursor ?? "null"}`,
    );
  }
  if (input.productionStartBlockAfter !== input.productionStartBlockBefore) {
    failures.push(
      `production_start_block changed: before=${input.productionStartBlockBefore} after=${input.productionStartBlockAfter ?? "null"}`,
    );
  }

  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}

export function describeWorkerHeartbeatStatus(input: {
  workerHeartbeatAt: string | null;
  nowMs: number;
  heartbeatStaleAfterMs?: number;
}): "paused-looking" | "active-looking" | "unknown" {
  if (input.workerHeartbeatAt === null) return "unknown";
  const hbMs = Date.parse(input.workerHeartbeatAt);
  if (Number.isNaN(hbMs)) return "unknown";
  const staleAfter =
    input.heartbeatStaleAfterMs ?? WORKER_HEARTBEAT_STALE_AFTER_MS;
  return input.nowMs - hbMs >= staleAfter ? "paused-looking" : "active-looking";
}
