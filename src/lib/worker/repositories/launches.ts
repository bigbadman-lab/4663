import { EVENT_SOURCE_PONS } from "@/lib/pons/constants";
import { EVENT_SOURCE_POOLS } from "@/lib/pools/constants";
import type { FactoryVersion, LaunchStatus } from "@/lib/pons/types";
import type { ResolvedPonsLaunch } from "@/lib/pons/launch-discovery";
import type { ActiveLaunchRow } from "@/lib/worker/db-types";
import {
  normalizeAddress,
  normalizeTxHash,
} from "@/lib/worker/normalize";
import type { WorkerSupabase } from "@/lib/worker/supabase";

type LaunchDbRow = {
  chain_id: number;
  token_address: string;
  market_address: string;
  factory_address: string;
  factory_version: string;
  launch_tx_hash: string;
  launch_block_number: number | string;
  launch_block_timestamp: string;
  status: string;
};

function mapLaunch(row: LaunchDbRow): ActiveLaunchRow {
  return {
    chainId: row.chain_id,
    tokenAddress: normalizeAddress(row.token_address),
    marketAddress: normalizeAddress(row.market_address),
    factoryAddress: normalizeAddress(row.factory_address),
    factoryVersion: row.factory_version as FactoryVersion,
    launchTxHash: normalizeTxHash(row.launch_tx_hash),
    launchBlockNumber: Number(row.launch_block_number),
    launchBlockTimestamp: row.launch_block_timestamp,
    status: row.status as LaunchStatus,
  };
}

/** Load ACTIVE pons launches for the given chain, optionally after watch boundary. */
export async function loadActiveLaunches(
  supabase: WorkerSupabase,
  chainId: number,
  opts?: {
    /**
     * Production start block B. When set (and observation unset), only rows with
     * launch_block_number > B are returned.
     */
    productionStartBlock?: number;
    /**
     * Observation start block X. When set, only rows with
     * launch_block_number >= X are returned (overrides production > B filter).
     */
    observationStartBlock?: number | null;
  },
): Promise<ActiveLaunchRow[]> {
  let query = supabase
    .from("pons_launches")
    .select(
      [
        "chain_id",
        "token_address",
        "market_address",
        "factory_address",
        "factory_version",
        "launch_tx_hash",
        "launch_block_number",
        "launch_block_timestamp",
        "status",
      ].join(", "),
    )
    .eq("chain_id", chainId)
    .eq("status", "active");

  if (
    opts?.observationStartBlock !== undefined &&
    opts.observationStartBlock !== null
  ) {
    query = query.gte("launch_block_number", opts.observationStartBlock);
  } else if (opts?.productionStartBlock !== undefined) {
    // boundary: launch > B
    query = query.gt("launch_block_number", opts.productionStartBlock);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `[4663-worker] loadActiveLaunches failed: ${error.message}`,
    );
  }

  return ((data ?? []) as unknown as LaunchDbRow[]).map(mapLaunch);
}

/**
 * Stage 11B: fired launches still inside the continuation age window
 * (launch_block_timestamp > cutoffIso). Watch boundary optional.
 */
export async function loadFiredLaunchesForContinuationWatch(
  supabase: WorkerSupabase,
  chainId: number,
  opts: {
    /** ISO timestamptz: keep launches with launch_block_timestamp > this. */
    launchTimestampAfterIso: string;
    productionStartBlock?: number;
    observationStartBlock?: number | null;
  },
): Promise<ActiveLaunchRow[]> {
  let query = supabase
    .from("pons_launches")
    .select(
      [
        "chain_id",
        "token_address",
        "market_address",
        "factory_address",
        "factory_version",
        "launch_tx_hash",
        "launch_block_number",
        "launch_block_timestamp",
        "status",
      ].join(", "),
    )
    .eq("chain_id", chainId)
    .eq("status", "fired")
    .gt("launch_block_timestamp", opts.launchTimestampAfterIso);

  if (
    opts.observationStartBlock !== undefined &&
    opts.observationStartBlock !== null
  ) {
    query = query.gte("launch_block_number", opts.observationStartBlock);
  } else if (opts.productionStartBlock !== undefined) {
    query = query.gt("launch_block_number", opts.productionStartBlock);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `[4663-worker] loadFiredLaunchesForContinuationWatch failed: ${error.message}`,
    );
  }

  return ((data ?? []) as unknown as LaunchDbRow[]).map(mapLaunch);
}

/**
 * Max token addresses per PostgREST `.in("token_address", …)` query when
 * loading existing pons_buyer_continuation rows. Mirrors first-buyer batching
 * so restart reconstruction stays under URL/filter size limits.
 */
export const CONTINUATION_EVENT_TOKEN_IN_BATCH_SIZE = 100 as const;

function chunkAddresses(addresses: string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < addresses.length; i += size) {
    out.push(addresses.slice(i, i + size));
  }
  return out;
}

function formatContinuationLookupError(
  error: { message?: string; code?: string; details?: string; hint?: string },
): string {
  const parts = [error.message ?? "unknown error"];
  if (error.code) parts.push(`code=${error.code}`);
  if (error.details) parts.push(`details=${error.details}`);
  if (error.hint) parts.push(`hint=${error.hint}`);
  return parts.join("; ");
}

/** Token addresses that already have a pons_buyer_continuation event for a source. */
export async function loadContinuationEventTokenAddresses(
  supabase: WorkerSupabase,
  chainId: number,
  tokenAddresses: string[],
  source: typeof EVENT_SOURCE_PONS | typeof EVENT_SOURCE_POOLS = EVENT_SOURCE_PONS,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (tokenAddresses.length === 0) return out;

  const uniqueTokens = [
    ...new Set(tokenAddresses.map((t) => normalizeAddress(t))),
  ];
  const batches = chunkAddresses(
    uniqueTokens,
    CONTINUATION_EVENT_TOKEN_IN_BATCH_SIZE,
  );

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]!;
    const { data, error } = await supabase
      .from("events")
      .select("token_address")
      .eq("chain_id", chainId)
      .eq("event_type", "pons_buyer_continuation")
      .eq("source", source)
      .in("token_address", batch);

    if (error) {
      throw new Error(
        `[4663-worker] loadContinuationEventTokenAddresses batch ${batchIndex + 1}/${batches.length} (${batch.length} addresses) failed: ${formatContinuationLookupError(error)}`,
      );
    }

    for (const row of data ?? []) {
      const addr = (row as { token_address?: string }).token_address;
      if (addr) out.add(normalizeAddress(addr));
    }
  }

  return out;
}

export type InsertLaunchResult =
  | { outcome: "inserted"; row: ActiveLaunchRow }
  | {
      outcome: "already_exists";
      row: ActiveLaunchRow;
      /** Existing lifecycle status preserved (must not reset terminal → active). */
      preservedStatus: LaunchStatus;
    };

/**
 * Idempotent insert of a resolved launch as status=active.
 * On conflict (token or tx unique): load existing and DO NOT overwrite status.
 */
export async function insertLaunchIdempotent(
  supabase: WorkerSupabase,
  launch: ResolvedPonsLaunch,
): Promise<InsertLaunchResult> {
  const payload = {
    chain_id: launch.chainId,
    factory_version: launch.factoryVersion,
    factory_address: launch.factoryAddress,
    token_address: launch.tokenAddress,
    market_address: launch.marketAddress,
    launch_tx_hash: launch.launchTxHash,
    launch_block_number: launch.launchBlockNumber,
    launch_block_timestamp: launch.launchBlockTimestampIso,
    status: "active" as const,
  };

  const { data, error } = await supabase
    .from("pons_launches")
    .insert(payload)
    .select(
      [
        "chain_id",
        "token_address",
        "market_address",
        "factory_address",
        "factory_version",
        "launch_tx_hash",
        "launch_block_number",
        "launch_block_timestamp",
        "status",
      ].join(", "),
    )
    .maybeSingle();

  if (!error && data) {
    return {
      outcome: "inserted",
      row: mapLaunch(data as unknown as LaunchDbRow),
    };
  }

  // Unique violation or race — preserve existing lifecycle.
  const isUnique =
    error?.code === "23505" ||
    (error?.message ?? "").toLowerCase().includes("duplicate") ||
    (error?.message ?? "").toLowerCase().includes("unique");

  if (error && !isUnique) {
    throw new Error(
      `[4663-worker] insertLaunchIdempotent failed: ${error.message}`,
    );
  }

  const existing = await loadLaunchByToken(
    supabase,
    launch.chainId,
    launch.tokenAddress,
  );
  if (!existing) {
    // Try by tx hash if token miss
    const byTx = await loadLaunchByTx(
      supabase,
      launch.chainId,
      launch.launchTxHash,
    );
    if (!byTx) {
      throw new Error(
        `[4663-worker] insertLaunch conflict but row not found for token ${launch.tokenAddress}`,
      );
    }
    return {
      outcome: "already_exists",
      row: byTx,
      preservedStatus: byTx.status,
    };
  }

  return {
    outcome: "already_exists",
    row: existing,
    preservedStatus: existing.status,
  };
}

export async function loadLaunchByToken(
  supabase: WorkerSupabase,
  chainId: number,
  tokenAddress: string,
): Promise<ActiveLaunchRow | null> {
  const { data, error } = await supabase
    .from("pons_launches")
    .select(
      [
        "chain_id",
        "token_address",
        "market_address",
        "factory_address",
        "factory_version",
        "launch_tx_hash",
        "launch_block_number",
        "launch_block_timestamp",
        "status",
      ].join(", "),
    )
    .eq("chain_id", chainId)
    .eq("token_address", normalizeAddress(tokenAddress))
    .maybeSingle();

  if (error) {
    throw new Error(
      `[4663-worker] loadLaunchByToken failed: ${error.message}`,
    );
  }
  if (!data) return null;
  return mapLaunch(data as unknown as LaunchDbRow);
}

export async function loadLaunchByTx(
  supabase: WorkerSupabase,
  chainId: number,
  launchTxHash: string,
): Promise<ActiveLaunchRow | null> {
  const { data, error } = await supabase
    .from("pons_launches")
    .select(
      [
        "chain_id",
        "token_address",
        "market_address",
        "factory_address",
        "factory_version",
        "launch_tx_hash",
        "launch_block_number",
        "launch_block_timestamp",
        "status",
      ].join(", "),
    )
    .eq("chain_id", chainId)
    .eq("launch_tx_hash", normalizeTxHash(launchTxHash))
    .maybeSingle();

  if (error) {
    throw new Error(`[4663-worker] loadLaunchByTx failed: ${error.message}`);
  }
  if (!data) return null;
  return mapLaunch(data as unknown as LaunchDbRow);
}
