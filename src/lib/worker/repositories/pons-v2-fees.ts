/**
 * PONS V2 curve-fee repository: atomic apply RPC + metrics load.
 * Does not schedule work or touch RADAR / continuation.
 */

import {
  PONS_V2_CURVE_FEE_VENUE,
  PONS_V2_FEE_FACTORY_VERSION,
  PONS_V2_FEE_LAUNCHPAD,
} from "@/lib/pons/curve-fee/constants";
import {
  mapDbNumericToDecimalString,
  parseFeeAmount,
  uint256ToDecimalString,
} from "@/lib/pons/curve-fee/numeric";
import type {
  ApplyPonsV2CurveFeesResult,
  PonsV2CurveFeeApplyInput,
  PonsV2CurveFeeEventRow,
  PonsV2CurveFeeSide,
  TokenFeeMetricsRow,
} from "@/lib/pons/curve-fee/types";
import { normalizeAddress, normalizeTxHash } from "@/lib/worker/normalize";
import type { WorkerSupabase } from "@/lib/worker/supabase";

export const APPLY_PONS_V2_CURVE_FEES_RPC = "apply_pons_v2_curve_fees" as const;

type TokenFeeMetricsDbRow = {
  chain_id: number;
  token_address: string;
  launchpad: string;
  factory_version: string;
  quote_token_address: string;
  global_fees_paid_quote: unknown;
  buy_fees_quote: unknown;
  sell_fees_quote: unknown;
  buy_count: number | string;
  sell_count: number | string;
  last_fee_block: number | string;
};

type CurveFeeEventDbRow = {
  chain_id: number;
  token_address: string;
  curve_address: string;
  tx_hash: string;
  log_index: number | string;
  block_number: number | string;
  side: string;
  fee_raw: unknown;
  tax_raw: unknown;
  total_fee_raw: unknown;
  venue: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asCount(value: number | string, field: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0 || !Number.isSafeInteger(n)) {
    throw new Error(`[4663-worker] invalid ${field}: ${String(value)}`);
  }
  return n;
}

function asSide(value: string): PonsV2CurveFeeSide {
  if (value === "buy" || value === "sell") return value;
  throw new Error(`[4663-worker] invalid curve fee side: ${value}`);
}

export function mapTokenFeeMetricsRow(
  row: TokenFeeMetricsDbRow,
): TokenFeeMetricsRow {
  if (row.launchpad !== PONS_V2_FEE_LAUNCHPAD) {
    throw new Error(`[4663-worker] unexpected launchpad: ${row.launchpad}`);
  }
  if (row.factory_version !== PONS_V2_FEE_FACTORY_VERSION) {
    throw new Error(
      `[4663-worker] unexpected factory_version: ${row.factory_version}`,
    );
  }
  return {
    chainId: row.chain_id,
    tokenAddress: normalizeAddress(row.token_address),
    launchpad: PONS_V2_FEE_LAUNCHPAD,
    factoryVersion: PONS_V2_FEE_FACTORY_VERSION,
    quoteTokenAddress: normalizeAddress(row.quote_token_address),
    globalFeesPaidQuote: mapDbNumericToDecimalString(
      row.global_fees_paid_quote,
      "global_fees_paid_quote",
    ),
    buyFeesQuote: mapDbNumericToDecimalString(row.buy_fees_quote, "buy_fees_quote"),
    sellFeesQuote: mapDbNumericToDecimalString(
      row.sell_fees_quote,
      "sell_fees_quote",
    ),
    buyCount: asCount(row.buy_count, "buy_count"),
    sellCount: asCount(row.sell_count, "sell_count"),
    lastFeeBlock: asCount(row.last_fee_block, "last_fee_block"),
  };
}

export function mapCurveFeeEventRow(
  row: CurveFeeEventDbRow,
): PonsV2CurveFeeEventRow {
  const feeRaw = mapDbNumericToDecimalString(row.fee_raw, "fee_raw");
  const taxRaw = mapDbNumericToDecimalString(row.tax_raw, "tax_raw");
  const totalFeeRaw = mapDbNumericToDecimalString(
    row.total_fee_raw,
    "total_fee_raw",
  );
  if (row.venue !== PONS_V2_CURVE_FEE_VENUE) {
    throw new Error(`[4663-worker] unexpected venue: ${row.venue}`);
  }
  return {
    chainId: row.chain_id,
    tokenAddress: normalizeAddress(row.token_address),
    curveAddress: normalizeAddress(row.curve_address),
    txHash: normalizeTxHash(row.tx_hash),
    logIndex: asCount(row.log_index, "log_index"),
    blockNumber: asCount(row.block_number, "block_number"),
    side: asSide(row.side),
    feeRaw,
    taxRaw,
    totalFeeRaw,
    venue: PONS_V2_CURVE_FEE_VENUE,
  };
}

export type PonsV2CurveFeeRpcPayload = {
  chain_id: number;
  token_address: string;
  curve_address: string;
  tx_hash: string;
  log_index: number;
  block_number: number;
  side: PonsV2CurveFeeSide;
  fee_raw: string;
  tax_raw: string;
  quote_token_address: string;
};

export function toApplyPonsV2CurveFeesPayload(
  input: PonsV2CurveFeeApplyInput,
): PonsV2CurveFeeRpcPayload {
  return {
    chain_id: input.chainId,
    token_address: normalizeAddress(input.tokenAddress),
    curve_address: normalizeAddress(input.curveAddress),
    tx_hash: normalizeTxHash(input.txHash),
    log_index: input.logIndex,
    block_number: input.blockNumber,
    side: input.side,
    fee_raw: uint256ToDecimalString(parseFeeAmount(input.feeRaw)),
    tax_raw: uint256ToDecimalString(parseFeeAmount(input.taxRaw)),
    quote_token_address: normalizeAddress(input.quoteTokenAddress),
  };
}

export async function applyPonsV2CurveFeeBatch(
  supabase: WorkerSupabase,
  events: readonly PonsV2CurveFeeApplyInput[],
): Promise<ApplyPonsV2CurveFeesResult> {
  if (events.length === 0) {
    return { status: "ok", applied: 0, skipped: 0 };
  }

  const payload = events.map(toApplyPonsV2CurveFeesPayload);
  const { data, error } = await supabase.rpc(APPLY_PONS_V2_CURVE_FEES_RPC, {
    p_events: payload,
  });

  if (error) {
    throw new Error(
      `[4663-worker] apply_pons_v2_curve_fees RPC failed: ${error.message}`,
    );
  }

  const raw = asRecord(data);
  const status = String(raw.status ?? "");
  if (status !== "ok") {
    throw new Error(
      `[4663-worker] apply_pons_v2_curve_fees unexpected status: ${status}`,
    );
  }

  return {
    status: "ok",
    applied: asCount(raw.applied as number | string, "applied"),
    skipped: asCount(raw.skipped as number | string, "skipped"),
  };
}

export const TOKEN_FEE_METRICS_SELECT = [
  "chain_id",
  "token_address",
  "launchpad",
  "factory_version",
  "quote_token_address",
  "global_fees_paid_quote::text",
  "buy_fees_quote::text",
  "sell_fees_quote::text",
  "buy_count",
  "sell_count",
  "last_fee_block",
].join(", ");

export async function loadTokenFeeMetrics(
  supabase: WorkerSupabase,
  chainId: number,
  tokenAddress: string,
): Promise<TokenFeeMetricsRow | null> {
  const { data, error } = await supabase
    .from("token_fee_metrics")
    .select(TOKEN_FEE_METRICS_SELECT)
    .eq("chain_id", chainId)
    .eq("token_address", normalizeAddress(tokenAddress))
    .maybeSingle();

  if (error) {
    throw new Error(
      `[4663-worker] loadTokenFeeMetrics failed: ${error.message}`,
    );
  }
  if (!data) return null;
  return mapTokenFeeMetricsRow(data as unknown as TokenFeeMetricsDbRow);
}

export const CURVE_FEE_EVENTS_RANGE_PAGE_SIZE = 500 as const;

export const CURVE_FEE_EVENT_COLUMNS = [
  "chain_id",
  "token_address",
  "curve_address",
  "tx_hash",
  "log_index",
  "block_number",
  "side",
  "fee_raw::text",
  "tax_raw::text",
  "total_fee_raw::text",
  "venue",
].join(", ");

export async function loadPonsV2CurveFeeEvent(
  supabase: WorkerSupabase,
  chainId: number,
  txHash: string,
  logIndex: number,
): Promise<PonsV2CurveFeeEventRow | null> {
  const { data, error } = await supabase
    .from("pons_v2_curve_fee_events")
    .select(CURVE_FEE_EVENT_COLUMNS)
    .eq("chain_id", chainId)
    .eq("tx_hash", normalizeTxHash(txHash))
    .eq("log_index", logIndex)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[4663-worker] loadPonsV2CurveFeeEvent failed: ${error.message}`,
    );
  }
  if (!data) return null;
  return mapCurveFeeEventRow(data as unknown as CurveFeeEventDbRow);
}

/**
 * Load ledger rows for one token in an inclusive block range (paginated).
 * Used for range-local verification; does not mutate cursors.
 */
export async function loadPonsV2CurveFeeEventsInRange(
  supabase: WorkerSupabase,
  chainId: number,
  tokenAddress: string,
  fromBlock: number,
  toBlock: number,
): Promise<PonsV2CurveFeeEventRow[]> {
  const token = normalizeAddress(tokenAddress);
  const out: PonsV2CurveFeeEventRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("pons_v2_curve_fee_events")
      .select(CURVE_FEE_EVENT_COLUMNS)
      .eq("chain_id", chainId)
      .eq("token_address", token)
      .gte("block_number", fromBlock)
      .lte("block_number", toBlock)
      .order("block_number", { ascending: true })
      .order("log_index", { ascending: true })
      .range(offset, offset + CURVE_FEE_EVENTS_RANGE_PAGE_SIZE - 1);

    if (error) {
      throw new Error(
        `[4663-worker] loadPonsV2CurveFeeEventsInRange failed: ${error.message}`,
      );
    }

    const rows = (data ?? []) as unknown as CurveFeeEventDbRow[];
    for (const row of rows) {
      out.push(mapCurveFeeEventRow(row));
    }
    if (rows.length < CURVE_FEE_EVENTS_RANGE_PAGE_SIZE) {
      break;
    }
    offset += CURVE_FEE_EVENTS_RANGE_PAGE_SIZE;
  }

  return out;
}

export const PONS_V2_FEE_INDEX_PAGE_SIZE = 500 as const;

export type PonsV2FeeLaunchRow = {
  tokenAddress: string;
  curveAddress: string;
  launchBlockNumber: number;
  status: string;
};

/**
 * All persisted PONS V2 launches regardless of status.
 * Fee indexing must continue after fired / expired / continuation resolved.
 */
export async function loadPonsV2LaunchesForFeeIndex(
  supabase: WorkerSupabase,
  chainId: number,
): Promise<PonsV2FeeLaunchRow[]> {
  const out: PonsV2FeeLaunchRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("pons_launches")
      .select(
        "token_address, market_address, launch_block_number, status, factory_version",
      )
      .eq("chain_id", chainId)
      .eq("factory_version", "v2")
      .order("launch_block_number", { ascending: true })
      .range(offset, offset + PONS_V2_FEE_INDEX_PAGE_SIZE - 1);

    if (error) {
      throw new Error(
        `[4663-worker] loadPonsV2LaunchesForFeeIndex failed: ${error.message}`,
      );
    }

    const rows = (data ?? []) as Array<{
      token_address: string;
      market_address: string;
      launch_block_number: number | string;
      status: string;
      factory_version: string;
    }>;
    for (const row of rows) {
      out.push({
        tokenAddress: normalizeAddress(row.token_address),
        curveAddress: normalizeAddress(row.market_address),
        launchBlockNumber: Number(row.launch_block_number),
        status: row.status,
      });
    }
    if (rows.length < PONS_V2_FEE_INDEX_PAGE_SIZE) {
      break;
    }
    offset += PONS_V2_FEE_INDEX_PAGE_SIZE;
  }

  return out;
}

/** Known quote tokens from prior fee applies. Does not assume native ETH. */
export async function loadQuoteTokenAddressesFromMetrics(
  supabase: WorkerSupabase,
  chainId: number,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("token_fee_metrics")
      .select("token_address, quote_token_address")
      .eq("chain_id", chainId)
      .eq("launchpad", "pons")
      .eq("factory_version", "v2")
      .order("token_address", { ascending: true })
      .range(offset, offset + PONS_V2_FEE_INDEX_PAGE_SIZE - 1);

    if (error) {
      throw new Error(
        `[4663-worker] loadQuoteTokenAddressesFromMetrics failed: ${error.message}`,
      );
    }

    const rows = (data ?? []) as Array<{
      token_address: string;
      quote_token_address: string;
    }>;
    for (const row of rows) {
      out.set(
        normalizeAddress(row.token_address),
        normalizeAddress(row.quote_token_address),
      );
    }
    if (rows.length < PONS_V2_FEE_INDEX_PAGE_SIZE) {
      break;
    }
    offset += PONS_V2_FEE_INDEX_PAGE_SIZE;
  }

  return out;
}
