import type { FirstBuyerRow } from "@/lib/worker/db-types";
import {
  normalizeAddress,
  normalizeTxHash,
  timestampToUnixSeconds,
} from "@/lib/worker/normalize";
import type { WorkerSupabase } from "@/lib/worker/supabase";

export const POOLS_FIRST_BUYERS_TOKEN_IN_BATCH_SIZE = 100 as const;

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

function chunkAddresses(addresses: string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < addresses.length; i += size) {
    out.push(addresses.slice(i, i + size));
  }
  return out;
}

function sortFirstBuyers(rows: FirstBuyerRow[]): FirstBuyerRow[] {
  return [...rows].sort((a, b) => {
    const ta = timestampToUnixSeconds(a.firstBuyBlockTimestamp);
    const tb = timestampToUnixSeconds(b.firstBuyBlockTimestamp);
    if (ta !== tb) return ta - tb;
    return a.walletAddress.localeCompare(b.walletAddress);
  });
}

export async function loadPoolsFirstBuyersForTokens(
  supabase: WorkerSupabase,
  chainId: number,
  tokenAddresses: string[],
): Promise<FirstBuyerRow[]> {
  if (tokenAddresses.length === 0) return [];

  const uniqueTokens = [...new Set(tokenAddresses.map(normalizeAddress))];
  const batches = chunkAddresses(
    uniqueTokens,
    POOLS_FIRST_BUYERS_TOKEN_IN_BATCH_SIZE,
  );
  const merged: FirstBuyerRow[] = [];

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]!;
    const { data, error } = await supabase
      .from("pools_first_buyers")
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
      .in("token_address", batch)
      .order("first_buy_block_timestamp", { ascending: true });

    if (error) {
      throw new Error(
        `[4663-worker] loadPoolsFirstBuyersForTokens failed: ${error.message} (batch ${batchIndex + 1}/${batches.length}, size=${batch.length})`,
      );
    }

    for (const row of (data ?? []) as unknown as FirstBuyerDbRow[]) {
      merged.push(mapBuyer(row));
    }
  }

  return sortFirstBuyers(merged);
}

export type InsertPoolsFirstBuyerInput = {
  chainId: number;
  tokenAddress: string;
  walletAddress: string;
  firstBuyTxHash: string;
  firstBuyBlockNumber: number;
  firstBuyBlockTimestampIso: string;
};

export type InsertPoolsFirstBuyerResult =
  | { outcome: "inserted"; row: FirstBuyerRow }
  | { outcome: "already_exists"; row: FirstBuyerRow };

export async function insertPoolsFirstBuyerIdempotent(
  supabase: WorkerSupabase,
  input: InsertPoolsFirstBuyerInput,
): Promise<InsertPoolsFirstBuyerResult> {
  const payload = {
    chain_id: input.chainId,
    token_address: normalizeAddress(input.tokenAddress),
    wallet_address: normalizeAddress(input.walletAddress),
    first_buy_tx_hash: normalizeTxHash(input.firstBuyTxHash),
    first_buy_block_number: input.firstBuyBlockNumber,
    first_buy_block_timestamp: input.firstBuyBlockTimestampIso,
  };

  const { data, error } = await supabase
    .from("pools_first_buyers")
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
      `[4663-worker] insertPoolsFirstBuyerIdempotent failed: ${error.message}`,
    );
  }

  const existing = await loadPoolsFirstBuyer(
    supabase,
    input.chainId,
    payload.token_address,
    payload.wallet_address,
  );
  if (!existing) {
    throw new Error(
      `[4663-worker] pools first-buyer conflict but row missing token=${payload.token_address} wallet=${payload.wallet_address}`,
    );
  }
  return { outcome: "already_exists", row: existing };
}

export async function loadPoolsFirstBuyer(
  supabase: WorkerSupabase,
  chainId: number,
  tokenAddress: string,
  walletAddress: string,
): Promise<FirstBuyerRow | null> {
  const { data, error } = await supabase
    .from("pools_first_buyers")
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
      `[4663-worker] loadPoolsFirstBuyer failed: ${error.message}`,
    );
  }
  if (!data) return null;
  return mapBuyer(data as unknown as FirstBuyerDbRow);
}
