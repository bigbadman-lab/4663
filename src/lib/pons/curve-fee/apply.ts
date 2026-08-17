/**
 * Pure PONS V2 curve-fee accumulation contract.
 * Production applies the same rules in apply_pons_v2_curve_fees (one DB transaction).
 * This module exists so Phase 1 tests can prove idempotency without a live Postgres.
 */

import {
  PONS_V2_CURVE_FEE_VENUE,
  PONS_V2_FEE_FACTORY_VERSION,
  PONS_V2_FEE_LAUNCHPAD,
} from "@/lib/pons/curve-fee/constants";
import {
  addQuoteAmounts,
  parseFeeAmount,
  uint256ToDecimalString,
} from "@/lib/pons/curve-fee/numeric";
import type {
  ApplyPonsV2CurveFeesResult,
  PonsV2CurveFeeApplyInput,
  PonsV2CurveFeeEventRow,
  TokenFeeMetricsRow,
} from "@/lib/pons/curve-fee/types";
import { normalizeAddress, normalizeTxHash } from "@/lib/worker/normalize";

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;
const TX_HASH_RE = /^0x[0-9a-f]{64}$/;

export type PonsV2CurveFeeStore = {
  events: Map<string, PonsV2CurveFeeEventRow>;
  metrics: Map<string, TokenFeeMetricsRow>;
};

export function createPonsV2CurveFeeStore(): PonsV2CurveFeeStore {
  return {
    events: new Map(),
    metrics: new Map(),
  };
}

export function curveFeeEventKey(
  chainId: number,
  txHash: string,
  logIndex: number,
): string {
  return `${chainId}:${normalizeTxHash(txHash)}:${logIndex}`;
}

export function tokenFeeMetricsKey(chainId: number, tokenAddress: string): string {
  return `${chainId}:${normalizeAddress(tokenAddress)}`;
}

function requireAddress(value: string, field: string): string {
  const hex = normalizeAddress(value);
  if (!ADDRESS_RE.test(hex)) {
    throw new Error(`[pons-v2-fees] invalid ${field}`);
  }
  return hex;
}

function requireTxHash(value: string): string {
  const hex = normalizeTxHash(value);
  if (!TX_HASH_RE.test(hex)) {
    throw new Error("[pons-v2-fees] invalid tx_hash");
  }
  return hex;
}

function requireNonNegativeInt(value: number, field: string): number {
  if (!Number.isInteger(value) || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`[pons-v2-fees] invalid ${field}`);
  }
  return value;
}

function normalizeApplyInput(
  input: PonsV2CurveFeeApplyInput,
): PonsV2CurveFeeEventRow & { quoteTokenAddress: string; totalFee: bigint } {
  if (input.side !== "buy" && input.side !== "sell") {
    throw new Error("[pons-v2-fees] side must be buy or sell");
  }
  const fee = parseFeeAmount(input.feeRaw);
  const tax = parseFeeAmount(input.taxRaw);
  const totalFee = addQuoteAmounts(fee, tax);
  return {
    chainId: requireNonNegativeInt(input.chainId, "chain_id"),
    tokenAddress: requireAddress(input.tokenAddress, "token_address"),
    curveAddress: requireAddress(input.curveAddress, "curve_address"),
    txHash: requireTxHash(input.txHash),
    logIndex: requireNonNegativeInt(input.logIndex, "log_index"),
    blockNumber: requireNonNegativeInt(input.blockNumber, "block_number"),
    side: input.side,
    feeRaw: uint256ToDecimalString(fee),
    taxRaw: uint256ToDecimalString(tax),
    totalFeeRaw: uint256ToDecimalString(totalFee),
    venue: PONS_V2_CURVE_FEE_VENUE,
    quoteTokenAddress: requireAddress(
      input.quoteTokenAddress,
      "quote_token_address",
    ),
    totalFee,
  };
}

function bigintFromDecimal(value: string): bigint {
  return parseFeeAmount(value);
}

/**
 * Apply a batch with the same semantics as apply_pons_v2_curve_fees:
 * 1. INSERT ledger ON CONFLICT DO NOTHING
 * 2. Only if inserted: upsert token_fee_metrics
 */
export function applyPonsV2CurveFeeBatchPure(
  store: PonsV2CurveFeeStore,
  events: readonly PonsV2CurveFeeApplyInput[],
): ApplyPonsV2CurveFeesResult {
  let applied = 0;
  let skipped = 0;

  for (const raw of events) {
    const event = normalizeApplyInput(raw);
    const key = curveFeeEventKey(event.chainId, event.txHash, event.logIndex);
    if (store.events.has(key)) {
      skipped += 1;
      continue;
    }

    const ledgerRow: PonsV2CurveFeeEventRow = {
      chainId: event.chainId,
      tokenAddress: event.tokenAddress,
      curveAddress: event.curveAddress,
      txHash: event.txHash,
      logIndex: event.logIndex,
      blockNumber: event.blockNumber,
      side: event.side,
      feeRaw: event.feeRaw,
      taxRaw: event.taxRaw,
      totalFeeRaw: event.totalFeeRaw,
      venue: PONS_V2_CURVE_FEE_VENUE,
    };
    store.events.set(key, ledgerRow);

    const metricsKey = tokenFeeMetricsKey(event.chainId, event.tokenAddress);
    const existing = store.metrics.get(metricsKey);
    const buyDelta = event.side === "buy" ? event.totalFee : BigInt(0);
    const sellDelta = event.side === "sell" ? event.totalFee : BigInt(0);
    const buyCountDelta = event.side === "buy" ? 1 : 0;
    const sellCountDelta = event.side === "sell" ? 1 : 0;

    if (!existing) {
      store.metrics.set(metricsKey, {
        chainId: event.chainId,
        tokenAddress: event.tokenAddress,
        launchpad: PONS_V2_FEE_LAUNCHPAD,
        factoryVersion: PONS_V2_FEE_FACTORY_VERSION,
        quoteTokenAddress: event.quoteTokenAddress,
        globalFeesPaidQuote: uint256ToDecimalString(event.totalFee),
        buyFeesQuote: uint256ToDecimalString(buyDelta),
        sellFeesQuote: uint256ToDecimalString(sellDelta),
        buyCount: buyCountDelta,
        sellCount: sellCountDelta,
        lastFeeBlock: event.blockNumber,
      });
    } else {
      store.metrics.set(metricsKey, {
        ...existing,
        quoteTokenAddress: existing.quoteTokenAddress,
        globalFeesPaidQuote: uint256ToDecimalString(
          bigintFromDecimal(existing.globalFeesPaidQuote) + event.totalFee,
        ),
        buyFeesQuote: uint256ToDecimalString(
          bigintFromDecimal(existing.buyFeesQuote) + buyDelta,
        ),
        sellFeesQuote: uint256ToDecimalString(
          bigintFromDecimal(existing.sellFeesQuote) + sellDelta,
        ),
        buyCount: existing.buyCount + buyCountDelta,
        sellCount: existing.sellCount + sellCountDelta,
        lastFeeBlock: Math.max(existing.lastFeeBlock, event.blockNumber),
      });
    }

    applied += 1;
  }

  return { status: "ok", applied, skipped };
}

export function loadTokenFeeMetricsFromStore(
  store: PonsV2CurveFeeStore,
  chainId: number,
  tokenAddress: string,
): TokenFeeMetricsRow | null {
  return (
    store.metrics.get(tokenFeeMetricsKey(chainId, tokenAddress)) ?? null
  );
}

export function loadCurveFeeEventFromStore(
  store: PonsV2CurveFeeStore,
  chainId: number,
  txHash: string,
  logIndex: number,
): PonsV2CurveFeeEventRow | null {
  return store.events.get(curveFeeEventKey(chainId, txHash, logIndex)) ?? null;
}
