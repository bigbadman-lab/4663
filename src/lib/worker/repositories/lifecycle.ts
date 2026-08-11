/**
 * Lifecycle repositories: atomic fire + conditional expire RPC wrappers.
 */

import type { WorkerSupabase } from "@/lib/worker/supabase";

export type FireRpcStatus =
  | "fired"
  | "already_fired"
  | "already_expired"
  | "not_eligible"
  | "not_found"
  | "not_active"
  | "error";

export type FireRpcResult = {
  status: FireRpcStatus;
  reason?: string;
  eventId?: string | null;
  newBuyers?: number;
  tokenAgeSeconds?: number;
  triggerTxHash?: string | null;
  raw: Record<string, unknown>;
};

export type ExpireRpcStatus =
  | "expired"
  | "already_expired"
  | "already_fired"
  | "not_found"
  | "not_active"
  | "error";

export type ExpireRpcResult = {
  status: ExpireRpcStatus;
  raw: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export async function callFirePonsBuyingActivity(
  supabase: WorkerSupabase,
  input: {
    chainId: number;
    tokenAddress: string;
    evaluationTimestampIso: string;
    evaluationBlockNumber: number;
    windowSeconds?: number;
    ageFloorSeconds?: number;
    watchTtlSeconds?: number;
    threshold?: number;
  },
): Promise<FireRpcResult> {
  const { data, error } = await supabase.rpc("fire_pons_buying_activity", {
    p_chain_id: input.chainId,
    p_token_address: input.tokenAddress,
    p_evaluation_timestamp: input.evaluationTimestampIso,
    p_evaluation_block_number: input.evaluationBlockNumber,
    p_window_seconds: input.windowSeconds ?? 180,
    p_age_floor_seconds: input.ageFloorSeconds ?? 180,
    p_watch_ttl_seconds: input.watchTtlSeconds ?? 3600,
    p_threshold: input.threshold ?? 5,
  });

  if (error) {
    throw new Error(
      `[4663-worker] fire_pons_buying_activity RPC failed: ${error.message}`,
    );
  }

  const raw = asRecord(data);
  const status = String(raw.status ?? "error") as FireRpcStatus;

  return {
    status,
    reason: raw.reason ? String(raw.reason) : undefined,
    eventId: raw.event_id ? String(raw.event_id) : null,
    newBuyers:
      typeof raw.new_buyers === "number" ? raw.new_buyers : undefined,
    tokenAgeSeconds:
      typeof raw.token_age_seconds === "number"
        ? raw.token_age_seconds
        : undefined,
    triggerTxHash:
      raw.trigger_tx_hash === null || raw.trigger_tx_hash === undefined
        ? null
        : String(raw.trigger_tx_hash),
    raw,
  };
}

export async function callExpirePonsLaunch(
  supabase: WorkerSupabase,
  input: {
    chainId: number;
    tokenAddress: string;
    evaluationTimestampIso: string;
  },
): Promise<ExpireRpcResult> {
  const { data, error } = await supabase.rpc("expire_pons_launch", {
    p_chain_id: input.chainId,
    p_token_address: input.tokenAddress,
    p_evaluation_timestamp: input.evaluationTimestampIso,
  });

  if (error) {
    throw new Error(
      `[4663-worker] expire_pons_launch RPC failed: ${error.message}`,
    );
  }

  const raw = asRecord(data);
  return {
    status: String(raw.status ?? "error") as ExpireRpcStatus,
    raw,
  };
}
