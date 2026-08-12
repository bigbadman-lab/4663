/**
 * Observation 1A — forward-observation activation constants + RPC clients.
 * Eligibility integration is Observation 1B (not here).
 */

import type { WorkerSupabase } from "@/lib/worker/supabase";

export const FORWARD_OBSERVATION_VERSION = "forward-obs-v1" as const;

export type ForwardObservationVersion = typeof FORWARD_OBSERVATION_VERSION;

export type ActivateForwardObservationStatus =
  | "activated"
  | "already_activated"
  | "error";

export type RollbackForwardObservationStatus =
  | "rolled_back"
  | "not_active"
  | "error";

export type CursorPair = {
  pons_factories: number;
  pons_transfers: number;
};

export type ActivateForwardObservationResult = {
  status: ActivateForwardObservationStatus;
  reason?: string;
  detail?: string;
  chainId?: number;
  productionStartBlock?: number;
  observationStartBlock?: number;
  observationStartedAt?: string;
  observationVersion?: string;
  cursors?: CursorPair;
  rollbackCursors?: CursorPair;
  raw: Record<string, unknown>;
};

export type RollbackForwardObservationResult = {
  status: RollbackForwardObservationStatus;
  reason?: string;
  detail?: string;
  chainId?: number;
  productionStartBlock?: number;
  previousObservationStartBlock?: number;
  previousObservationVersion?: string;
  restoredCursors?: CursorPair;
  note?: string;
  raw: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function asCursorPair(value: unknown): CursorPair | undefined {
  const rec = asRecord(value);
  const factories = asOptionalNumber(rec.pons_factories);
  const transfers = asOptionalNumber(rec.pons_transfers);
  if (factories === undefined || transfers === undefined) return undefined;
  return { pons_factories: factories, pons_transfers: transfers };
}

/** Pure: activation target cursor N = X - 1. */
export function observationCursorTargetBlock(
  observationStartBlock: number,
): number {
  if (!Number.isInteger(observationStartBlock) || observationStartBlock < 1) {
    throw new Error(
      "[4663-worker] observationCursorTargetBlock requires integer X >= 1",
    );
  }
  return observationStartBlock - 1;
}

/** Pure: X must be strictly greater than production B. */
export function isValidObservationBoundary(
  observationStartBlock: number,
  productionStartBlock: number,
): boolean {
  return (
    Number.isInteger(observationStartBlock) &&
    observationStartBlock >= 1 &&
    observationStartBlock > productionStartBlock
  );
}

export async function callActivateForwardObservation(
  supabase: WorkerSupabase,
  input: {
    chainId: number;
    observationStartBlock: number;
    observationVersion?: string;
  },
): Promise<ActivateForwardObservationResult> {
  const { data, error } = await supabase.rpc("activate_forward_observation", {
    p_chain_id: input.chainId,
    p_observation_start_block: input.observationStartBlock,
    p_observation_version:
      input.observationVersion ?? FORWARD_OBSERVATION_VERSION,
  });

  if (error) {
    throw new Error(
      `[4663-worker] activate_forward_observation RPC failed: ${error.message}`,
    );
  }

  const raw = asRecord(data);
  const status = String(raw.status ?? "error") as ActivateForwardObservationStatus;

  return {
    status,
    reason: raw.reason ? String(raw.reason) : undefined,
    detail: raw.detail ? String(raw.detail) : undefined,
    chainId: asOptionalNumber(raw.chain_id),
    productionStartBlock: asOptionalNumber(raw.production_start_block),
    observationStartBlock: asOptionalNumber(raw.observation_start_block),
    observationStartedAt: raw.observation_started_at
      ? String(raw.observation_started_at)
      : undefined,
    observationVersion: raw.observation_version
      ? String(raw.observation_version)
      : undefined,
    cursors: asCursorPair(raw.cursors),
    rollbackCursors: asCursorPair(raw.rollback_cursors),
    raw,
  };
}

export async function callRollbackForwardObservation(
  supabase: WorkerSupabase,
  input: { chainId: number },
): Promise<RollbackForwardObservationResult> {
  const { data, error } = await supabase.rpc("rollback_forward_observation", {
    p_chain_id: input.chainId,
  });

  if (error) {
    throw new Error(
      `[4663-worker] rollback_forward_observation RPC failed: ${error.message}`,
    );
  }

  const raw = asRecord(data);
  const status = String(
    raw.status ?? "error",
  ) as RollbackForwardObservationStatus;

  return {
    status,
    reason: raw.reason ? String(raw.reason) : undefined,
    detail: raw.detail ? String(raw.detail) : undefined,
    chainId: asOptionalNumber(raw.chain_id),
    productionStartBlock: asOptionalNumber(raw.production_start_block),
    previousObservationStartBlock: asOptionalNumber(
      raw.previous_observation_start_block,
    ),
    previousObservationVersion: raw.previous_observation_version
      ? String(raw.previous_observation_version)
      : undefined,
    restoredCursors: asCursorPair(raw.restored_cursors),
    note: raw.note ? String(raw.note) : undefined,
    raw,
  };
}
