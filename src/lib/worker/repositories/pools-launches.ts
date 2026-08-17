import { CHAIN_ID } from "@/lib/pons/constants";
import type { ResolvedPoolsInstantLaunch } from "@/lib/pools/launch-discovery/types";
import {
  normalizeAddress,
  normalizeTxHash,
} from "@/lib/worker/normalize";
import type { WorkerSupabase } from "@/lib/worker/supabase";

export type PoolsInstantLaunchRow = {
  chainId: number;
  launchpad: "pools";
  tokenAddress: string;
  launchTxHash: string;
  launchBlockNumber: number;
  launchBlockTimestamp: string;
  sourceContract: string;
  sourceVersion: string;
  poolId: string;
  finalPositionRecipient: string;
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooksAddress: string;
  launchedTokenCurrencyIndex: 0 | 1;
};

type LaunchDbRow = {
  chain_id: number;
  launchpad: string;
  token_address: string;
  launch_tx_hash: string;
  launch_block_number: number | string;
  launch_block_timestamp: string;
  source_contract: string;
  source_version: string;
  pool_id: string;
  final_position_recipient: string;
  currency0: string;
  currency1: string;
  fee: number | string;
  tick_spacing: number | string;
  hooks_address: string;
  launched_token_currency_index: number | string;
};

const SELECT_COLUMNS = [
  "chain_id",
  "launchpad",
  "token_address",
  "launch_tx_hash",
  "launch_block_number",
  "launch_block_timestamp",
  "source_contract",
  "source_version",
  "pool_id",
  "final_position_recipient",
  "currency0",
  "currency1",
  "fee",
  "tick_spacing",
  "hooks_address",
  "launched_token_currency_index",
].join(", ");

function mapLaunch(row: LaunchDbRow): PoolsInstantLaunchRow {
  const index = Number(row.launched_token_currency_index);
  if (index !== 0 && index !== 1) {
    throw new Error(
      `[4663-worker] pools instant launch has invalid currency index ${String(row.launched_token_currency_index)}`,
    );
  }
  return {
    chainId: row.chain_id,
    launchpad: "pools",
    tokenAddress: normalizeAddress(row.token_address),
    launchTxHash: normalizeTxHash(row.launch_tx_hash),
    launchBlockNumber: Number(row.launch_block_number),
    launchBlockTimestamp: row.launch_block_timestamp,
    sourceContract: normalizeAddress(row.source_contract),
    sourceVersion: String(row.source_version),
    poolId: row.pool_id.trim().toLowerCase(),
    finalPositionRecipient: normalizeAddress(row.final_position_recipient),
    currency0: normalizeAddress(row.currency0),
    currency1: normalizeAddress(row.currency1),
    fee: Number(row.fee),
    tickSpacing: Number(row.tick_spacing),
    hooksAddress: normalizeAddress(row.hooks_address),
    launchedTokenCurrencyIndex: index,
  };
}

export type InsertPoolsInstantLaunchResult =
  | { outcome: "inserted"; row: PoolsInstantLaunchRow }
  | { outcome: "already_exists"; row: PoolsInstantLaunchRow };

export async function insertPoolsInstantLaunchIdempotent(
  supabase: WorkerSupabase,
  launch: ResolvedPoolsInstantLaunch,
): Promise<InsertPoolsInstantLaunchResult> {
  const payload = {
    chain_id: launch.chainId,
    launchpad: launch.launchpad,
    token_address: launch.tokenAddress,
    launch_tx_hash: launch.launchTxHash,
    launch_block_number: launch.launchBlockNumber,
    launch_block_timestamp: launch.launchBlockTimestampIso,
    source_contract: launch.sourceContract,
    source_version: launch.sourceVersion,
    pool_id: launch.poolId,
    final_position_recipient: launch.finalPositionRecipient,
    currency0: launch.currency0,
    currency1: launch.currency1,
    fee: launch.fee,
    tick_spacing: launch.tickSpacing,
    hooks_address: launch.hooksAddress,
    launched_token_currency_index: launch.launchedTokenCurrencyIndex,
  };

  const { data, error } = await supabase
    .from("pools_instant_launches")
    .insert(payload)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (!error && data) {
    return {
      outcome: "inserted",
      row: mapLaunch(data as unknown as LaunchDbRow),
    };
  }

  const isUnique =
    error?.code === "23505" ||
    (error?.message ?? "").toLowerCase().includes("duplicate") ||
    (error?.message ?? "").toLowerCase().includes("unique");

  if (error && !isUnique) {
    throw new Error(
      `[4663-worker] insertPoolsInstantLaunchIdempotent failed: ${error.message}`,
    );
  }

  const existing = await loadPoolsInstantLaunchByToken(
    supabase,
    launch.chainId,
    launch.tokenAddress,
  );
  if (!existing) {
    const byTx = await loadPoolsInstantLaunchByTx(
      supabase,
      launch.chainId,
      launch.launchTxHash,
    );
    if (!byTx) {
      throw new Error(
        `[4663-worker] pools instant insert conflict but row not found for token ${launch.tokenAddress}`,
      );
    }
    return { outcome: "already_exists", row: byTx };
  }

  return { outcome: "already_exists", row: existing };
}

export async function loadPoolsInstantLaunchByToken(
  supabase: WorkerSupabase,
  chainId: number,
  tokenAddress: string,
): Promise<PoolsInstantLaunchRow | null> {
  const { data, error } = await supabase
    .from("pools_instant_launches")
    .select(SELECT_COLUMNS)
    .eq("chain_id", chainId)
    .eq("token_address", normalizeAddress(tokenAddress))
    .maybeSingle();

  if (error) {
    throw new Error(
      `[4663-worker] loadPoolsInstantLaunchByToken failed: ${error.message}`,
    );
  }
  if (!data) return null;
  return mapLaunch(data as unknown as LaunchDbRow);
}

export async function loadPoolsInstantLaunchByPoolId(
  supabase: WorkerSupabase,
  chainId: number,
  poolId: string,
): Promise<PoolsInstantLaunchRow | null> {
  const { data, error } = await supabase
    .from("pools_instant_launches")
    .select(SELECT_COLUMNS)
    .eq("chain_id", chainId)
    .eq("pool_id", poolId.trim().toLowerCase())
    .maybeSingle();

  if (error) {
    throw new Error(
      `[4663-worker] loadPoolsInstantLaunchByPoolId failed: ${error.message}`,
    );
  }
  if (!data) return null;
  return mapLaunch(data as unknown as LaunchDbRow);
}

export async function loadPoolsInstantLaunchesForContinuationWatch(
  supabase: WorkerSupabase,
  chainId: number,
  opts: {
    launchTimestampAfterIso: string;
    productionStartBlock?: number;
    observationStartBlock?: number | null;
  },
): Promise<PoolsInstantLaunchRow[]> {
  let query = supabase
    .from("pools_instant_launches")
    .select(SELECT_COLUMNS)
    .eq("chain_id", chainId)
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
      `[4663-worker] loadPoolsInstantLaunchesForContinuationWatch failed: ${error.message}`,
    );
  }
  return ((data ?? []) as unknown as LaunchDbRow[]).map(mapLaunch);
}

export async function loadPoolsInstantLaunchByTx(
  supabase: WorkerSupabase,
  chainId: number,
  launchTxHash: string,
): Promise<PoolsInstantLaunchRow | null> {
  const { data, error } = await supabase
    .from("pools_instant_launches")
    .select(SELECT_COLUMNS)
    .eq("chain_id", chainId)
    .eq("launch_tx_hash", normalizeTxHash(launchTxHash))
    .maybeSingle();

  if (error) {
    throw new Error(
      `[4663-worker] loadPoolsInstantLaunchByTx failed: ${error.message}`,
    );
  }
  if (!data) return null;
  return mapLaunch(data as unknown as LaunchDbRow);
}

export function resolveExtractedPoolsInstantLaunch(
  extracted: {
    tokenAddress: string;
    launchTxHash: string;
    launchBlockNumber: number;
    sourceContract: string;
    sourceVersion: ResolvedPoolsInstantLaunch["sourceVersion"];
    poolId: string;
    finalPositionRecipient: string;
    poolKey: {
      currency0: string;
      currency1: string;
      fee: number;
      tickSpacing: number;
      hooks: string;
    };
    launchedTokenCurrencyIndex: 0 | 1;
  },
  launchBlockTimestampUnix: number,
): ResolvedPoolsInstantLaunch {
  return {
    chainId: CHAIN_ID,
    launchpad: "pools",
    tokenAddress: normalizeAddress(extracted.tokenAddress),
    launchTxHash: normalizeTxHash(extracted.launchTxHash),
    launchBlockNumber: extracted.launchBlockNumber,
    launchBlockTimestampUnix,
    launchBlockTimestampIso: new Date(
      launchBlockTimestampUnix * 1000,
    ).toISOString(),
    sourceContract: normalizeAddress(extracted.sourceContract),
    sourceVersion: extracted.sourceVersion,
    poolId: extracted.poolId.trim().toLowerCase(),
    finalPositionRecipient: normalizeAddress(extracted.finalPositionRecipient),
    currency0: normalizeAddress(extracted.poolKey.currency0),
    currency1: normalizeAddress(extracted.poolKey.currency1),
    fee: extracted.poolKey.fee,
    tickSpacing: extracted.poolKey.tickSpacing,
    hooksAddress: normalizeAddress(extracted.poolKey.hooks),
    launchedTokenCurrencyIndex: extracted.launchedTokenCurrencyIndex,
  };
}
