/**
 * production_state repository — read + atomic cutover RPC.
 */

import {
  PRODUCTION_CUTOVER_VERSION,
  type ProductionCutoverVersion,
} from "@/lib/pons/production-boundary";
import type { WorkerSupabase } from "@/lib/worker/supabase";

export type ProductionStateRow = {
  chainId: number;
  productionStartBlock: number;
  productionStartedAt: string;
  cutoverVersion: ProductionCutoverVersion | string;
  createdAt: string;
};

export type CutoverRpcStatus =
  | "cutover_applied"
  | "already_cutover"
  | "error";

export type CutoverRpcResult = {
  status: CutoverRpcStatus;
  reason?: string;
  chainId?: number;
  productionStartBlock?: number;
  productionStartedAt?: string;
  cutoverVersion?: string;
  cursors?: {
    pons_factories: number;
    pons_transfers: number;
  };
  raw: Record<string, unknown>;
};

type ProductionStateDb = {
  chain_id: number;
  production_start_block: number | string;
  production_started_at: string;
  cutover_version: string;
  created_at: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function mapRow(row: ProductionStateDb): ProductionStateRow {
  return {
    chainId: row.chain_id,
    productionStartBlock: Number(row.production_start_block),
    productionStartedAt: row.production_started_at,
    cutoverVersion: row.cutover_version,
    createdAt: row.created_at,
  };
}

/** Load production cutover marker, or null if not cut over. */
export async function loadProductionState(
  supabase: WorkerSupabase,
  chainId: number,
): Promise<ProductionStateRow | null> {
  const { data, error } = await supabase
    .from("production_state")
    .select(
      "chain_id, production_start_block, production_started_at, cutover_version, created_at",
    )
    .eq("chain_id", chainId)
    .maybeSingle();

  if (error) {
    // Table missing (migration not applied) surfaces clearly.
    throw new Error(
      `[4663-worker] loadProductionState failed: ${error.message}`,
    );
  }

  if (!data) return null;
  return mapRow(data as unknown as ProductionStateDb);
}

export async function callPerformProductionCutover(
  supabase: WorkerSupabase,
  input: {
    chainId: number;
    productionStartBlock: number;
    cutoverVersion?: string;
  },
): Promise<CutoverRpcResult> {
  const { data, error } = await supabase.rpc("perform_production_cutover", {
    p_chain_id: input.chainId,
    p_production_start_block: input.productionStartBlock,
    p_cutover_version: input.cutoverVersion ?? PRODUCTION_CUTOVER_VERSION,
  });

  if (error) {
    throw new Error(
      `[4663-worker] perform_production_cutover RPC failed: ${error.message}`,
    );
  }

  const raw = asRecord(data);
  const status = String(raw.status ?? "error") as CutoverRpcStatus;
  const cursorsRaw = asRecord(raw.cursors);

  return {
    status,
    reason: raw.reason ? String(raw.reason) : undefined,
    chainId:
      typeof raw.chain_id === "number" ? raw.chain_id : undefined,
    productionStartBlock:
      raw.production_start_block !== undefined
        ? Number(raw.production_start_block)
        : undefined,
    productionStartedAt: raw.production_started_at
      ? String(raw.production_started_at)
      : undefined,
    cutoverVersion: raw.cutover_version
      ? String(raw.cutover_version)
      : undefined,
    cursors:
      cursorsRaw.pons_factories !== undefined &&
      cursorsRaw.pons_transfers !== undefined
        ? {
            pons_factories: Number(cursorsRaw.pons_factories),
            pons_transfers: Number(cursorsRaw.pons_transfers),
          }
        : undefined,
    raw,
  };
}
