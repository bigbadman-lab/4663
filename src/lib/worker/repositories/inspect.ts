/**
 * Read-only durable state inspection for operators (no mutations).
 */

import {
  CURSOR_STREAM_PONS_FACTORIES,
  CURSOR_STREAM_PONS_TRANSFERS,
  WORKER_NAME,
} from "@/lib/pons/constants";
import { CURSOR_STREAM_POOLS_INSTANT, CURSOR_STREAM_POOLS_SWAPS } from "@/lib/pools/constants";
import { loadKnownCursors } from "@/lib/worker/repositories/cursors";
import { loadProductionState } from "@/lib/worker/repositories/production-state";
import type { WorkerSupabase } from "@/lib/worker/supabase";

export type DurableStateSnapshot = {
  chainId: number;
  productionStartBlock: number | null;
  cutoverVersion: string | null;
  productionStartedAt: string | null;
  observationStartBlock: number | null;
  observationVersion: string | null;
  observationStartedAt: string | null;
  factoryCursor: number | null;
  transferCursor: number | null;
  /** Independent Instant discovery cursor; never aligned by cutover/observation. */
  poolsInstantCursor: number | null;
  /** Independent Instant activity cursor; never aligned by cutover/observation. */
  poolsSwapsCursor: number | null;
  activeLaunchCount: number;
  firedLaunchCount: number;
  expiredLaunchCount: number;
  firstBuyerCount: number;
  eventCount: number;
  /** ACTIVE launches with block ≤ B when cutover set; or total active when no cutover */
  preBoundaryActiveCount: number;
  /** ACTIVE launches with block < X when observation set; else 0 */
  preObservationActiveCount: number;
  oldestActiveLaunchBlock: number | null;
  newestActiveLaunchBlock: number | null;
  workerHealth: {
    workerName: string;
    lastHeartbeatAt: string | null;
    latestChainBlock: number | null;
    latestProcessedBlock: number | null;
    activeTokens: number | null;
  } | null;
};

async function countWhere(
  supabase: WorkerSupabase,
  table: string,
  filters: { column: string; value: string | number }[],
): Promise<number> {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  for (const f of filters) {
    q = q.eq(f.column, f.value);
  }
  const { count, error } = await q;
  if (error) {
    throw new Error(
      `[4663-worker] count ${table} failed: ${error.message}`,
    );
  }
  return count ?? 0;
}

export async function inspectDurableState(
  supabase: WorkerSupabase,
  chainId: number,
): Promise<DurableStateSnapshot> {
  const production = await loadProductionState(supabase, chainId);
  const cursors = await loadKnownCursors(supabase, chainId);

  const [
    activeLaunchCount,
    firedLaunchCount,
    expiredLaunchCount,
    firstBuyerCount,
    eventCount,
  ] = await Promise.all([
    countWhere(supabase, "pons_launches", [
      { column: "chain_id", value: chainId },
      { column: "status", value: "active" },
    ]),
    countWhere(supabase, "pons_launches", [
      { column: "chain_id", value: chainId },
      { column: "status", value: "fired" },
    ]),
    countWhere(supabase, "pons_launches", [
      { column: "chain_id", value: chainId },
      { column: "status", value: "expired" },
    ]),
    countWhere(supabase, "pons_first_buyers", [
      { column: "chain_id", value: chainId },
    ]),
    countWhere(supabase, "events", [{ column: "chain_id", value: chainId }]),
  ]);

  const { data: activeBlocks, error: activeErr } = await supabase
    .from("pons_launches")
    .select("launch_block_number")
    .eq("chain_id", chainId)
    .eq("status", "active")
    .order("launch_block_number", { ascending: true });

  if (activeErr) {
    throw new Error(
      `[4663-worker] active launch blocks query failed: ${activeErr.message}`,
    );
  }

  const blocks = ((activeBlocks ?? []) as { launch_block_number: number | string }[])
    .map((r) => Number(r.launch_block_number))
    .filter((n) => Number.isFinite(n));

  let oldestActiveLaunchBlock: number | null = null;
  let newestActiveLaunchBlock: number | null = null;
  let preBoundaryActiveCount = 0;
  let preObservationActiveCount = 0;

  if (blocks.length > 0) {
    oldestActiveLaunchBlock = blocks[0]!;
    newestActiveLaunchBlock = blocks[blocks.length - 1]!;
  }

  if (production) {
    const B = production.productionStartBlock;
    preBoundaryActiveCount = blocks.filter((b) => b <= B).length;
    const X = production.observationStartBlock;
    if (X !== null) {
      preObservationActiveCount = blocks.filter((b) => b < X).length;
    }
  } else {
    preBoundaryActiveCount = activeLaunchCount;
  }

  const { data: health, error: healthErr } = await supabase
    .from("worker_health")
    .select(
      "worker_name, last_heartbeat_at, latest_chain_block, latest_processed_block, active_tokens",
    )
    .eq("worker_name", WORKER_NAME)
    .maybeSingle();

  if (healthErr) {
    throw new Error(
      `[4663-worker] worker_health query failed: ${healthErr.message}`,
    );
  }

  let workerHealth: DurableStateSnapshot["workerHealth"] = null;
  if (health) {
    const h = health as {
      worker_name: string;
      last_heartbeat_at: string | null;
      latest_chain_block: number | string | null;
      latest_processed_block: number | string | null;
      active_tokens: number | null;
    };
    workerHealth = {
      workerName: h.worker_name,
      lastHeartbeatAt: h.last_heartbeat_at,
      latestChainBlock:
        h.latest_chain_block === null || h.latest_chain_block === undefined
          ? null
          : Number(h.latest_chain_block),
      latestProcessedBlock:
        h.latest_processed_block === null ||
        h.latest_processed_block === undefined
          ? null
          : Number(h.latest_processed_block),
      activeTokens: h.active_tokens,
    };
  }

  return {
    chainId,
    productionStartBlock: production?.productionStartBlock ?? null,
    cutoverVersion: production?.cutoverVersion ?? null,
    productionStartedAt: production?.productionStartedAt ?? null,
    observationStartBlock: production?.observationStartBlock ?? null,
    observationVersion: production?.observationVersion ?? null,
    observationStartedAt: production?.observationStartedAt ?? null,
    factoryCursor:
      cursors.get(CURSOR_STREAM_PONS_FACTORIES)?.lastProcessedBlock ?? null,
    transferCursor:
      cursors.get(CURSOR_STREAM_PONS_TRANSFERS)?.lastProcessedBlock ?? null,
    poolsInstantCursor:
      cursors.get(CURSOR_STREAM_POOLS_INSTANT)?.lastProcessedBlock ?? null,
    poolsSwapsCursor:
      cursors.get(CURSOR_STREAM_POOLS_SWAPS)?.lastProcessedBlock ?? null,
    activeLaunchCount,
    firedLaunchCount,
    expiredLaunchCount,
    firstBuyerCount,
    eventCount,
    preBoundaryActiveCount,
    preObservationActiveCount,
    oldestActiveLaunchBlock,
    newestActiveLaunchBlock,
    workerHealth,
  };
}

export function formatDurableStateReport(
  snap: DurableStateSnapshot,
  opts?: { chainHead?: number | null },
): string[] {
  const lines: string[] = [
    `chain_id=${snap.chainId}`,
    `chain_head=${opts?.chainHead ?? "n/a"}`,
    `production_start_block=${snap.productionStartBlock ?? "NONE"}`,
    `cutover_version=${snap.cutoverVersion ?? "NONE"}`,
    `production_started_at=${snap.productionStartedAt ?? "NONE"}`,
    `observation_start_block=${snap.observationStartBlock ?? "not_active"}`,
    `observation_version=${snap.observationVersion ?? "not_active"}`,
    `observation_started_at=${snap.observationStartedAt ?? "not_active"}`,
    `cursor pons_factories=${snap.factoryCursor ?? "NONE"}`,
    `cursor pons_transfers=${snap.transferCursor ?? "NONE"}`,
    `cursor pools_instant=${snap.poolsInstantCursor ?? "NONE"}`,
    `cursor pools_swaps=${snap.poolsSwapsCursor ?? "NONE"}`,
    `launches active=${snap.activeLaunchCount} fired=${snap.firedLaunchCount} expired=${snap.expiredLaunchCount}`,
    `pre_boundary_or_dev_active=${snap.preBoundaryActiveCount}`,
    `pre_observation_active=${snap.preObservationActiveCount}`,
    `active_launch_blocks oldest=${snap.oldestActiveLaunchBlock ?? "n/a"} newest=${snap.newestActiveLaunchBlock ?? "n/a"}`,
    `first_buyers=${snap.firstBuyerCount}`,
    `events=${snap.eventCount}`,
  ];
  if (snap.workerHealth) {
    lines.push(
      `worker_health heartbeat=${snap.workerHealth.lastHeartbeatAt ?? "null"} head=${snap.workerHealth.latestChainBlock ?? "null"} processed=${snap.workerHealth.latestProcessedBlock ?? "null"} active_tokens=${snap.workerHealth.activeTokens ?? "null"}`,
    );
  } else {
    lines.push("worker_health=NONE");
  }
  return lines;
}
