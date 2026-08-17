/**
 * Closed-range PONS V2 curve-fee scanner.
 * Operator verification only: explicit from/to, no cursor writes, no worker loop.
 */

import {
  PONS_V2_CURVE_BUY_TOPIC0,
  PONS_V2_CURVE_FEE_TOPIC0S,
  PONS_V2_CURVE_INITIALIZED_TOPIC0,
  PONS_V2_CURVE_SELL_TOPIC0,
  PONS_V2_SNIPE_TAX_CHARGED_TOPIC0,
  PONS_V2_SNIPE_TAX_EXEMPTED_TOPIC0,
} from "@/lib/pons/curve-fee/constants";
import { decodePonsV2CurveFeeLog } from "@/lib/pons/curve-fee/decode";
import {
  addQuoteAmounts,
  decimalStringToUint256,
  uint256ToDecimalString,
} from "@/lib/pons/curve-fee/numeric";
import type {
  DecodedPonsV2CurveFee,
  PonsV2CurveFeeApplyInput,
  TokenFeeMetricsRow,
} from "@/lib/pons/curve-fee/types";
import type { ChainRpc, RpcLog } from "@/lib/worker/chain/rpc";
import {
  FACTORY_SCAN_INITIAL_CHUNK_BLOCKS,
  FACTORY_SCAN_MAX_CHUNK_BLOCKS,
  FACTORY_SCAN_MIN_CHUNK_BLOCKS,
  FACTORY_SCAN_RATE_LIMIT_RETRIES,
  FACTORY_SCAN_REQUEST_DELAY_MS,
} from "@/lib/worker/constants";
import { normalizeAddress } from "@/lib/worker/normalize";
import {
  applyPonsV2CurveFeeBatch,
  loadPonsV2CurveFeeEventsInRange,
  loadTokenFeeMetrics,
} from "@/lib/worker/repositories/pons-v2-fees";
import type { WorkerSupabase } from "@/lib/worker/supabase";

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;

export type PonsV2CurveFeeScanInput = {
  rpc: ChainRpc;
  supabase: WorkerSupabase;
  chainId: number;
  tokenAddress: string;
  curveAddress: string;
  quoteTokenAddress: string;
  fromBlock: number;
  toBlock: number;
};

export type MalformedCurveFeeLog = {
  topic0: string | null;
  topicCount: number;
  dataBytes: number;
  blockNumber: string | null;
  logIndex: number | null;
  txHash: string | null;
  reason:
    | "wrong_topic0"
    | "decode_failed"
    | "curve_mismatch"
    | "out_of_range"
    | "missing_metadata";
  knownEvent: string | null;
};

export type PonsV2CurveFeeScanResult = {
  chainId: number;
  tokenAddress: string;
  curveAddress: string;
  quoteTokenAddress: string;
  fromBlock: number;
  toBlock: number;
  rawLogs: number;
  decodedBuys: number;
  decodedSells: number;
  malformed: number;
  totalFeeRaw: string;
  totalTaxRaw: string;
  totalPaidRaw: string;
  inserted: number;
  skippedDuplicates: number;
  applyStatus: "ok" | "failed";
  failures: string[];
  malformedLogs: MalformedCurveFeeLog[];
  rangeLocalPaidRaw: string;
  lifetimePaidRaw: string;
  rangeMatch: boolean;
  metricsAfter: TokenFeeMetricsRow | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimitError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("429") ||
    m.includes("too many requests") ||
    m.includes("rate limit") ||
    m.includes("compute units")
  );
}

function isRangeError(message: string): boolean {
  if (isRateLimitError(message)) return false;
  const m = message.toLowerCase();
  return (
    m.includes("block range") ||
    m.includes("block request") ||
    m.includes("free tier") ||
    m.includes("10 block") ||
    m.includes("response size") ||
    m.includes("too many results") ||
    m.includes("query returned more than") ||
    m.includes("-32005") ||
    m.includes("-32600") ||
    m.includes("-32602")
  );
}

function parseSuggestedMaxBlocks(message: string): number | null {
  const m =
    message.match(/up to a (\d+)\s*block/i) ??
    message.match(/maximum (?:of )?(\d+) blocks?/i);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function requireAddress(value: string, field: string): string {
  const hex = normalizeAddress(value);
  if (!ADDRESS_RE.test(hex)) {
    throw new Error(`[pons-v2-fees] invalid ${field}`);
  }
  return hex;
}

export function validatePonsV2CurveFeeScanRange(
  fromBlock: number,
  toBlock: number,
): void {
  if (
    !Number.isInteger(fromBlock) ||
    !Number.isInteger(toBlock) ||
    fromBlock < 0 ||
    toBlock < 0
  ) {
    throw new Error(
      `[pons-v2-fees] invalid closed range ${String(fromBlock)}-${String(toBlock)}`,
    );
  }
  if (fromBlock > toBlock) {
    throw new Error(
      `[pons-v2-fees] invalid closed range ${fromBlock}-${toBlock}: fromBlock must be <= toBlock`,
    );
  }
}

export function labelPonsV2CurveTopic0(topic0: string | null): string | null {
  if (topic0 === PONS_V2_CURVE_BUY_TOPIC0) return "CurveBuy";
  if (topic0 === PONS_V2_CURVE_SELL_TOPIC0) return "CurveSell";
  if (topic0 === PONS_V2_CURVE_INITIALIZED_TOPIC0) return "Initialized";
  if (topic0 === PONS_V2_SNIPE_TAX_EXEMPTED_TOPIC0) return "SnipeTaxExempted";
  if (topic0 === PONS_V2_SNIPE_TAX_CHARGED_TOPIC0) return "SnipeTaxCharged";
  return null;
}

export type ClassifiedPonsV2CurveFeeLogs = {
  decoded: DecodedPonsV2CurveFee[];
  decodedBuys: number;
  decodedSells: number;
  malformed: number;
  malformedLogs: MalformedCurveFeeLog[];
  totalFee: bigint;
  totalTax: bigint;
  totalPaid: bigint;
};

function topic0OfLog(log: RpcLog): string | null {
  const topic0 = log.topics[0]?.trim().toLowerCase() ?? null;
  return topic0 && topic0.length > 0 ? topic0 : null;
}

function dataBytesOf(data: string): number {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  return Math.floor(hex.length / 2);
}

function malformedFromLog(
  log: RpcLog,
  reason: MalformedCurveFeeLog["reason"],
): MalformedCurveFeeLog {
  const topic0 = topic0OfLog(log);
  return {
    topic0,
    topicCount: log.topics.length,
    dataBytes: dataBytesOf(log.data),
    blockNumber:
      log.blockNumber === null || log.blockNumber === undefined
        ? null
        : log.blockNumber.toString(),
    logIndex: log.logIndex,
    txHash: log.transactionHash,
    reason,
    knownEvent: labelPonsV2CurveTopic0(topic0),
  };
}

/**
 * Decode logs for one curve. Wrong-address / out-of-range / malformed logs
 * are counted as malformed and never applied.
 */
export function classifyPonsV2CurveFeeLogs(
  logs: readonly RpcLog[],
  curveAddress: string,
  fromBlock: number,
  toBlock: number,
): ClassifiedPonsV2CurveFeeLogs {
  const expectedCurve = normalizeAddress(curveAddress);
  const decoded: DecodedPonsV2CurveFee[] = [];
  const malformedLogs: MalformedCurveFeeLog[] = [];
  const seen = new Set<string>();
  let totalFee = 0n;
  let totalTax = 0n;

  for (const log of logs) {
    const topic0 = topic0OfLog(log);
    const parsed = decodePonsV2CurveFeeLog(log);
    if (!parsed) {
      const reason =
        topic0 === PONS_V2_CURVE_BUY_TOPIC0 ||
        topic0 === PONS_V2_CURVE_SELL_TOPIC0
          ? "decode_failed"
          : "wrong_topic0";
      malformedLogs.push(malformedFromLog(log, reason));
      continue;
    }
    if (parsed.curveAddress !== expectedCurve) {
      malformedLogs.push(malformedFromLog(log, "curve_mismatch"));
      continue;
    }
    if (parsed.blockNumber < fromBlock || parsed.blockNumber > toBlock) {
      malformedLogs.push(malformedFromLog(log, "out_of_range"));
      continue;
    }
    const key = `${parsed.txHash}:${parsed.logIndex}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    decoded.push(parsed);
    totalFee += parsed.fee;
    totalTax += parsed.tax;
  }

  decoded.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
    return a.logIndex - b.logIndex;
  });

  return {
    decoded,
    decodedBuys: decoded.filter((d) => d.side === "buy").length,
    decodedSells: decoded.filter((d) => d.side === "sell").length,
    malformed: malformedLogs.length,
    malformedLogs,
    totalFee,
    totalTax,
    totalPaid: addQuoteAmounts(totalFee, totalTax),
  };
}

async function getLogsChunkWithRetry(
  rpc: ChainRpc,
  fromBlock: number,
  toBlock: number,
  address?: string,
): Promise<RpcLog[]> {
  let attempt = 0;
  for (;;) {
    try {
      if (FACTORY_SCAN_REQUEST_DELAY_MS > 0) {
        await sleep(FACTORY_SCAN_REQUEST_DELAY_MS);
      }
      return await rpc.getLogs({
        ...(address ? { address } : {}),
        fromBlock,
        toBlock,
        topic0: [...PONS_V2_CURVE_FEE_TOPIC0S],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!isRateLimitError(msg) || attempt >= FACTORY_SCAN_RATE_LIMIT_RETRIES) {
        throw err;
      }
      await sleep(Math.min(30_000, 500 * 2 ** attempt));
      attempt += 1;
    }
  }
}

/**
 * Adaptive CurveBuy|CurveSell getLogs.
 * Pass address for a single curve (operator verify); omit for live topic-only scan.
 */
export async function fetchPonsV2CurveFeeLogsAdaptive(
  rpc: ChainRpc,
  fromBlock: number,
  toBlock: number,
  address?: string,
): Promise<RpcLog[]> {
  const out: RpcLog[] = [];
  let cursor = fromBlock;
  let chunkSize: number = FACTORY_SCAN_INITIAL_CHUNK_BLOCKS;
  let hardMax: number | null = null;

  while (cursor <= toBlock) {
    if (hardMax !== null && chunkSize > hardMax) chunkSize = hardMax;
    const end = Math.min(cursor + chunkSize - 1, toBlock);
    try {
      const logs = await getLogsChunkWithRetry(rpc, cursor, end, address);
      out.push(...logs);
      cursor = end + 1;
      if (chunkSize < FACTORY_SCAN_MAX_CHUNK_BLOCKS) {
        const cap = hardMax ?? FACTORY_SCAN_MAX_CHUNK_BLOCKS;
        chunkSize = Math.min(chunkSize * 2, cap);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isRateLimitError(msg)) throw err;
      if (!isRangeError(msg) || chunkSize <= FACTORY_SCAN_MIN_CHUNK_BLOCKS) {
        throw err;
      }
      const suggested = parseSuggestedMaxBlocks(msg);
      if (suggested !== null) hardMax = suggested;
      chunkSize =
        suggested !== null && suggested < chunkSize
          ? suggested
          : Math.max(
              FACTORY_SCAN_MIN_CHUNK_BLOCKS,
              Math.floor(chunkSize / 2),
            );
    }
  }
  return out;
}

function toApplyInput(
  input: PonsV2CurveFeeScanInput,
  decoded: DecodedPonsV2CurveFee,
): PonsV2CurveFeeApplyInput {
  return {
    chainId: input.chainId,
    tokenAddress: input.tokenAddress,
    curveAddress: input.curveAddress,
    txHash: decoded.txHash,
    logIndex: decoded.logIndex,
    blockNumber: decoded.blockNumber,
    side: decoded.side,
    feeRaw: decoded.fee,
    taxRaw: decoded.tax,
    quoteTokenAddress: input.quoteTokenAddress,
  };
}

/**
 * Scan one explicit block range for one PONS V2 curve and apply decoded fees.
 * Does not write chain_cursors or production_state.
 */
export async function scanPonsV2CurveFeesRange(
  input: PonsV2CurveFeeScanInput,
): Promise<PonsV2CurveFeeScanResult> {
  validatePonsV2CurveFeeScanRange(input.fromBlock, input.toBlock);
  const tokenAddress = requireAddress(input.tokenAddress, "tokenAddress");
  const curveAddress = requireAddress(input.curveAddress, "curveAddress");
  const quoteTokenAddress = requireAddress(
    input.quoteTokenAddress,
    "quoteTokenAddress",
  );
  const resolved: PonsV2CurveFeeScanInput = {
    ...input,
    tokenAddress,
    curveAddress,
    quoteTokenAddress,
  };

  const rawLogs = await fetchPonsV2CurveFeeLogsAdaptive(
    resolved.rpc,
    resolved.fromBlock,
    resolved.toBlock,
    curveAddress,
  );
  const classified = classifyPonsV2CurveFeeLogs(
    rawLogs,
    curveAddress,
    resolved.fromBlock,
    resolved.toBlock,
  );

  const failures: string[] = [];
  let inserted = 0;
  let skippedDuplicates = 0;
  let applyStatus: "ok" | "failed" = "ok";

  try {
    const applied = await applyPonsV2CurveFeeBatch(
      resolved.supabase,
      classified.decoded.map((decoded) => toApplyInput(resolved, decoded)),
    );
    inserted = applied.applied;
    skippedDuplicates = applied.skipped;
  } catch (err) {
    applyStatus = "failed";
    inserted = 0;
    skippedDuplicates = 0;
    failures.push(
      `apply_failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let metricsAfter: TokenFeeMetricsRow | null = null;
  let rangeLocalPaid = 0n;
  try {
    metricsAfter = await loadTokenFeeMetrics(
      resolved.supabase,
      resolved.chainId,
      tokenAddress,
    );
    const rangeRows = await loadPonsV2CurveFeeEventsInRange(
      resolved.supabase,
      resolved.chainId,
      tokenAddress,
      resolved.fromBlock,
      resolved.toBlock,
    );
    for (const row of rangeRows) {
      rangeLocalPaid += decimalStringToUint256(row.totalFeeRaw);
    }
  } catch (err) {
    failures.push(
      `verify_failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const lifetimePaidRaw = metricsAfter?.globalFeesPaidQuote ?? "0";
  const rangeLocalPaidRaw = uint256ToDecimalString(rangeLocalPaid);
  const totalPaidRaw = uint256ToDecimalString(classified.totalPaid);
  const rangeMatch =
    applyStatus === "ok" &&
    failures.length === 0 &&
    rangeLocalPaidRaw === totalPaidRaw;

  return {
    chainId: resolved.chainId,
    tokenAddress,
    curveAddress,
    quoteTokenAddress,
    fromBlock: resolved.fromBlock,
    toBlock: resolved.toBlock,
    rawLogs: rawLogs.length,
    decodedBuys: classified.decodedBuys,
    decodedSells: classified.decodedSells,
    malformed: classified.malformed,
    totalFeeRaw: uint256ToDecimalString(classified.totalFee),
    totalTaxRaw: uint256ToDecimalString(classified.totalTax),
    totalPaidRaw,
    inserted,
    skippedDuplicates,
    applyStatus,
    failures,
    malformedLogs: classified.malformedLogs,
    rangeLocalPaidRaw,
    lifetimePaidRaw,
    rangeMatch,
    metricsAfter,
  };
}
