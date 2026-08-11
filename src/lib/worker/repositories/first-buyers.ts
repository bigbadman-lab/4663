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

export type InsertFirstBuyerInput = {
  chainId: number;
  tokenAddress: string;
  walletAddress: string;
  firstBuyTxHash: string;
  firstBuyBlockNumber: number;
  /** ISO timestamptz from chain block timestamp */
  firstBuyBlockTimestampIso: string;
};

export type InsertFirstBuyerResult =
  | { outcome: "inserted"; row: FirstBuyerRow }
  | { outcome: "already_exists"; row: FirstBuyerRow };

/**
 * Idempotent first-buyer insert.
 * ON CONFLICT DO NOTHING semantics — never overwrite earlier first-buy tx/time.
 */
export async function insertFirstBuyerIdempotent(
  supabase: WorkerSupabase,
  input: InsertFirstBuyerInput,
): Promise<InsertFirstBuyerResult> {
  const payload = {
    chain_id: input.chainId,
    token_address: normalizeAddress(input.tokenAddress),
    wallet_address: normalizeAddress(input.walletAddress),
    first_buy_tx_hash: normalizeTxHash(input.firstBuyTxHash),
    first_buy_block_number: input.firstBuyBlockNumber,
    first_buy_block_timestamp: input.firstBuyBlockTimestampIso,
  };

  const { data, error } = await supabase
    .from("pons_first_buyers")
    .insert(payload)
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
    .maybeSingle();

  if (!error && data) {
    return {
      outcome: "inserted",
      row: mapBuyer(data as unknown as FirstBuyerDbRow),
    };
  }

  const isUnique =
    error?.code === "23505" ||
    (error?.message ?? "").toLowerCase().includes("duplicate") ||
    (error?.message ?? "").toLowerCase().includes("unique");

  if (error && !isUnique) {
    throw new Error(
      `[4663-worker] insertFirstBuyerIdempotent failed: ${error.message}`,
    );
  }

  const existing = await loadFirstBuyer(
    supabase,
    input.chainId,
    payload.token_address,
    payload.wallet_address,
  );
  if (!existing) {
    throw new Error(
      `[4663-worker] first-buyer conflict but row missing token=${payload.token_address} wallet=${payload.wallet_address}`,
    );
  }
  return { outcome: "already_exists", row: existing };
}

export async function loadFirstBuyer(
  supabase: WorkerSupabase,
  chainId: number,
  tokenAddress: string,
  walletAddress: string,
): Promise<FirstBuyerRow | null> {
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
    .eq("token_address", normalizeAddress(tokenAddress))
    .eq("wallet_address", normalizeAddress(walletAddress))
    .maybeSingle();

  if (error) {
    throw new Error(
      `[4663-worker] loadFirstBuyer failed: ${error.message}`,
    );
  }
  if (!data) return null;
  return mapBuyer(data as unknown as FirstBuyerDbRow);
}
