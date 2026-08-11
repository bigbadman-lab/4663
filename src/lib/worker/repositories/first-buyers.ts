import type { FirstBuyerRow } from "@/lib/worker/db-types";
import {
  normalizeAddress,
  normalizeTxHash,
} from "@/lib/worker/normalize";
import type { WorkerSupabase } from "@/lib/worker/supabase";

type FirstBuyerDbRow = {
  chain_id: number;
  token_address: string;
  wallet_address: string;
  first_buy_tx_hash: string;
  first_buy_block_number: number | string;
  first_buy_block_timestamp: string;
};

function mapBuyer(row: FirstBuyerDbRow): FirstBuyerRow {
  return {
    chainId: row.chain_id,
    tokenAddress: normalizeAddress(row.token_address),
    walletAddress: normalizeAddress(row.wallet_address),
    firstBuyTxHash: normalizeTxHash(row.first_buy_tx_hash),
    firstBuyBlockNumber: Number(row.first_buy_block_number),
    firstBuyBlockTimestamp: row.first_buy_block_timestamp,
  };
}

/**
 * Load confirmed first buyers for a set of ACTIVE token addresses (batched).
 * Returns empty array when token set is empty (no DB call).
 */
export async function loadFirstBuyersForTokens(
  supabase: WorkerSupabase,
  chainId: number,
  tokenAddresses: string[],
): Promise<FirstBuyerRow[]> {
  if (tokenAddresses.length === 0) {
    return [];
  }

  const normalised = tokenAddresses.map(normalizeAddress);

  const { data, error } = await supabase
    .from("pons_first_buyers")
    .select(
      [
        "chain_id",
        "token_address",
        "wallet_address",
        "first_buy_tx_hash",
        "first_buy_block_number",
        "first_buy_block_timestamp",
      ].join(", "),
    )
    .eq("chain_id", chainId)
    .in("token_address", normalised)
    .order("first_buy_block_timestamp", { ascending: true });

  if (error) {
    throw new Error(
      `[4663-worker] loadFirstBuyersForTokens failed: ${error.message}`,
    );
  }

  return ((data ?? []) as unknown as FirstBuyerDbRow[]).map(mapBuyer);
}
