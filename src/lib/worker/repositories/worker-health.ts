import { WORKER_NAME } from "@/lib/pons/constants";
import type { WorkerHealthUpsert } from "@/lib/worker/db-types";
import type { WorkerSupabase } from "@/lib/worker/supabase";

/**
 * Upsert the single operational worker_health row.
 * Uses wall-clock timestamps (ops only — not product authority).
 */
export async function upsertWorkerHealth(
  supabase: WorkerSupabase,
  input: Omit<WorkerHealthUpsert, "workerName"> & {
    workerName?: string;
  },
): Promise<void> {
  const workerName = input.workerName ?? WORKER_NAME;
  const nowIso = input.lastHeartbeatAt;

  const { error } = await supabase.from("worker_health").upsert(
    {
      worker_name: workerName,
      last_heartbeat_at: nowIso,
      latest_chain_block: input.latestChainBlock,
      latest_processed_block: input.latestProcessedBlock,
      active_tokens: input.activeTokens,
      // updated_at maintained by DB trigger; include for explicit write safety
      updated_at: nowIso,
    },
    { onConflict: "worker_name" },
  );

  if (error) {
    throw new Error(
      `[4663-worker] upsertWorkerHealth failed: ${error.message}`,
    );
  }
}

export async function loadWorkerHealth(
  supabase: WorkerSupabase,
  workerName: string = WORKER_NAME,
): Promise<{
  workerName: string;
  lastHeartbeatAt: string;
  latestChainBlock: number | null;
  latestProcessedBlock: number | null;
  activeTokens: number;
} | null> {
  const { data, error } = await supabase
    .from("worker_health")
    .select(
      "worker_name, last_heartbeat_at, latest_chain_block, latest_processed_block, active_tokens",
    )
    .eq("worker_name", workerName)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[4663-worker] loadWorkerHealth failed: ${error.message}`,
    );
  }

  if (!data) return null;

  const row = data as {
    worker_name: string;
    last_heartbeat_at: string;
    latest_chain_block: number | string | null;
    latest_processed_block: number | string | null;
    active_tokens: number;
  };

  return {
    workerName: row.worker_name,
    lastHeartbeatAt: row.last_heartbeat_at,
    latestChainBlock:
      row.latest_chain_block === null ? null : Number(row.latest_chain_block),
    latestProcessedBlock:
      row.latest_processed_block === null
        ? null
        : Number(row.latest_processed_block),
    activeTokens: row.active_tokens,
  };
}
