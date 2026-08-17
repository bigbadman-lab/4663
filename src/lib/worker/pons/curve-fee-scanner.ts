/**
 * Live PONS V2 curve-fee range scan: topic-only getLogs + curve map + atomic apply.
 * Operator verify remains in scanPonsV2CurveFeesRange (single curve + address).
 */

import {
  rememberQuoteToken,
  type PonsV2FeeCurveIndex,
} from "@/lib/pons/curve-fee/curve-map";
import { decodePonsV2CurveFeeLog } from "@/lib/pons/curve-fee/decode";
import { readCurvePairToken } from "@/lib/pons/curve-fee/pair-token";
import { fetchPonsV2CurveFeeLogsAdaptive, validatePonsV2CurveFeeScanRange } from "@/lib/pons/curve-fee/scan";
import type { PonsV2CurveFeeApplyInput } from "@/lib/pons/curve-fee/types";
import type { ChainRpc } from "@/lib/worker/chain/rpc";
import { normalizeAddress } from "@/lib/worker/normalize";
import { applyPonsV2CurveFeeBatch } from "@/lib/worker/repositories/pons-v2-fees";
import type { WorkerSupabase } from "@/lib/worker/supabase";

export type PonsV2CurveFeeLiveScanResult = {
  fromBlock: number;
  toBlock: number;
  rawLogs: number;
  decodedBuys: number;
  decodedSells: number;
  unknownCurves: number;
  malformed: number;
  preLaunchIgnored: number;
  inserted: number;
  skippedDuplicates: number;
  feesAddedQuoteByTokenCount: number;
  fullyProcessed: boolean;
  failures: string[];
};

export async function scanPonsV2CurveFeesLiveRange(input: {
  rpc: ChainRpc;
  supabase: WorkerSupabase;
  chainId: number;
  fromBlock: number;
  toBlock: number;
  index: PonsV2FeeCurveIndex;
}): Promise<PonsV2CurveFeeLiveScanResult> {
  validatePonsV2CurveFeeScanRange(input.fromBlock, input.toBlock);

  const empty = (overrides: Partial<PonsV2CurveFeeLiveScanResult> = {}) => ({
    fromBlock: input.fromBlock,
    toBlock: input.toBlock,
    rawLogs: 0,
    decodedBuys: 0,
    decodedSells: 0,
    unknownCurves: 0,
    malformed: 0,
    preLaunchIgnored: 0,
    inserted: 0,
    skippedDuplicates: 0,
    feesAddedQuoteByTokenCount: 0,
    fullyProcessed: true,
    failures: [],
    ...overrides,
  });

  const logs = await fetchPonsV2CurveFeeLogsAdaptive(
    input.rpc,
    input.fromBlock,
    input.toBlock,
  );

  const applyInputs: PonsV2CurveFeeApplyInput[] = [];
  const tokensWithFees = new Set<string>();
  const unknownCurves = new Set<string>();
  let decodedBuys = 0;
  let decodedSells = 0;
  let malformed = 0;
  let preLaunchIgnored = 0;

  type Candidate = {
    curveAddress: string;
    tokenAddress: string;
    txHash: string;
    logIndex: number;
    blockNumber: number;
    side: "buy" | "sell";
    feeRaw: bigint;
    taxRaw: bigint;
  };
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  for (const log of logs) {
    const decoded = decodePonsV2CurveFeeLog(log);
    if (!decoded) {
      malformed += 1;
      continue;
    }
    if (
      decoded.blockNumber < input.fromBlock ||
      decoded.blockNumber > input.toBlock
    ) {
      continue;
    }
    const entry = input.index.byCurve.get(decoded.curveAddress);
    if (!entry) {
      unknownCurves.add(decoded.curveAddress);
      continue;
    }
    if (decoded.blockNumber < entry.launchBlockNumber) {
      preLaunchIgnored += 1;
      continue;
    }
    const key = `${decoded.txHash}:${decoded.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (decoded.side === "buy") decodedBuys += 1;
    else decodedSells += 1;
    candidates.push({
      curveAddress: decoded.curveAddress,
      tokenAddress: entry.tokenAddress,
      txHash: decoded.txHash,
      logIndex: decoded.logIndex,
      blockNumber: decoded.blockNumber,
      side: decoded.side,
      feeRaw: decoded.fee,
      taxRaw: decoded.tax,
    });
  }

  const unresolved = new Set<string>();
  for (const candidate of candidates) {
    const entry = input.index.byCurve.get(candidate.curveAddress);
    if (!entry) continue;
    if (entry.quoteTokenAddress) continue;
    unresolved.add(candidate.curveAddress);
  }

  for (const curve of unresolved) {
    try {
      const quote = await readCurvePairToken(input.rpc, curve);
      rememberQuoteToken(input.index, curve, quote);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return empty({
        rawLogs: logs.length,
        decodedBuys,
        decodedSells,
        unknownCurves: unknownCurves.size,
        malformed,
        preLaunchIgnored,
        fullyProcessed: false,
        failures: [`quote_unresolved:${normalizeAddress(curve)} ${msg}`],
      });
    }
  }

  for (const candidate of candidates) {
    const entry = input.index.byCurve.get(candidate.curveAddress);
    const quote = entry?.quoteTokenAddress;
    if (!quote) {
      return empty({
        rawLogs: logs.length,
        decodedBuys,
        decodedSells,
        unknownCurves: unknownCurves.size,
        malformed,
        preLaunchIgnored,
        fullyProcessed: false,
        failures: [`quote_unresolved:${candidate.curveAddress}`],
      });
    }
    applyInputs.push({
      chainId: input.chainId,
      tokenAddress: candidate.tokenAddress,
      curveAddress: candidate.curveAddress,
      txHash: candidate.txHash,
      logIndex: candidate.logIndex,
      blockNumber: candidate.blockNumber,
      side: candidate.side,
      feeRaw: candidate.feeRaw,
      taxRaw: candidate.taxRaw,
      quoteTokenAddress: quote,
    });
    tokensWithFees.add(candidate.tokenAddress);
  }

  try {
    const applied = await applyPonsV2CurveFeeBatch(input.supabase, applyInputs);
    return {
      fromBlock: input.fromBlock,
      toBlock: input.toBlock,
      rawLogs: logs.length,
      decodedBuys,
      decodedSells,
      unknownCurves: unknownCurves.size,
      malformed,
      preLaunchIgnored,
      inserted: applied.applied,
      skippedDuplicates: applied.skipped,
      feesAddedQuoteByTokenCount: tokensWithFees.size,
      fullyProcessed: true,
      failures: [],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      fromBlock: input.fromBlock,
      toBlock: input.toBlock,
      rawLogs: logs.length,
      decodedBuys,
      decodedSells,
      unknownCurves: unknownCurves.size,
      malformed,
      preLaunchIgnored,
      inserted: 0,
      skippedDuplicates: 0,
      feesAddedQuoteByTokenCount: 0,
      fullyProcessed: false,
      failures: [`apply_failed: ${msg}`],
    };
  }
}
