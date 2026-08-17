/**
 * In-memory curve → token map for PONS V2 fee indexing.
 * Includes every persisted V2 launch regardless of status.
 * Does not use loadActiveLaunches.
 */

import type { FactoryVersion } from "@/lib/pons/types";
import { normalizeAddress } from "@/lib/worker/normalize";
import {
  loadPonsV2LaunchesForFeeIndex,
  loadQuoteTokenAddressesFromMetrics,
} from "@/lib/worker/repositories/pons-v2-fees";
import type { WorkerSupabase } from "@/lib/worker/supabase";

export type PonsV2FeeCurveEntry = {
  tokenAddress: string;
  launchBlockNumber: number;
  quoteTokenAddress: string | null;
};

export type PonsV2FeeCurveIndex = {
  byCurve: Map<string, PonsV2FeeCurveEntry>;
};

export type PonsV2FeeLaunchLike = {
  factoryVersion: FactoryVersion | string;
  tokenAddress: string;
  marketAddress: string;
  launchBlockNumber: number;
};

export function createPonsV2FeeCurveIndex(): PonsV2FeeCurveIndex {
  return { byCurve: new Map() };
}

export function addPonsV2LaunchToFeeIndex(
  index: PonsV2FeeCurveIndex,
  launch: PonsV2FeeLaunchLike,
): boolean {
  if (launch.factoryVersion !== "v2") return false;
  const curve = normalizeAddress(launch.marketAddress);
  const token = normalizeAddress(launch.tokenAddress);
  const existing = index.byCurve.get(curve);
  if (existing && existing.tokenAddress !== token) {
    return false;
  }
  if (existing) {
    if (launch.launchBlockNumber < existing.launchBlockNumber) {
      existing.launchBlockNumber = launch.launchBlockNumber;
    }
    return false;
  }
  index.byCurve.set(curve, {
    tokenAddress: token,
    launchBlockNumber: launch.launchBlockNumber,
    quoteTokenAddress: null,
  });
  return true;
}

export function rememberQuoteToken(
  index: PonsV2FeeCurveIndex,
  curveAddress: string,
  quoteTokenAddress: string,
): void {
  const entry = index.byCurve.get(normalizeAddress(curveAddress));
  if (!entry) return;
  entry.quoteTokenAddress = normalizeAddress(quoteTokenAddress);
}

export async function reconstructPonsV2FeeCurveIndex(
  supabase: WorkerSupabase,
  chainId: number,
): Promise<PonsV2FeeCurveIndex> {
  const index = createPonsV2FeeCurveIndex();
  const launches = await loadPonsV2LaunchesForFeeIndex(supabase, chainId);
  for (const launch of launches) {
    addPonsV2LaunchToFeeIndex(index, {
      factoryVersion: "v2",
      tokenAddress: launch.tokenAddress,
      marketAddress: launch.curveAddress,
      launchBlockNumber: launch.launchBlockNumber,
    });
  }

  const quotes = await loadQuoteTokenAddressesFromMetrics(supabase, chainId);
  const tokenToCurve = new Map<string, string>();
  for (const [curve, entry] of index.byCurve) {
    tokenToCurve.set(entry.tokenAddress, curve);
  }
  for (const [token, quote] of quotes) {
    const curve = tokenToCurve.get(token);
    if (!curve) continue;
    rememberQuoteToken(index, curve, quote);
  }
  return index;
}
