import type { FactoryVersion, LaunchStatus } from "@/lib/pons/types";
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

/** Load all ACTIVE pons launches for the given chain. */
export async function loadActiveLaunches(
  supabase: WorkerSupabase,
  chainId: number,
): Promise<ActiveLaunchRow[]> {
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
    .eq("status", "active");

  if (error) {
    throw new Error(
      `[4663-worker] loadActiveLaunches failed: ${error.message}`,
    );
  }

  return ((data ?? []) as unknown as LaunchDbRow[]).map(mapLaunch);
}
