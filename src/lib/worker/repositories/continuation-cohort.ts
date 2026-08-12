/**
 * Observation 1E — read-only loaders for PONS CONTINUATION validation cohort.
 *
 * SELECT-only. No INSERT/UPDATE/DELETE/UPSERT/RPC mutation.
 */

import {
  CONTINUATION_COHORT_TARGET,
  CONTINUATION_EVENT_TYPE,
  buildContinuationCohort,
  requireObservationActive,
  type CohortReport,
  type ContinuationCohortEventRow,
  type ContinuationCohortFirstBuyerRow,
  type ContinuationCohortLaunchRow,
} from "@/lib/worker/continuation-cohort";
import {
  normalizeAddress,
  normalizeTxHash,
} from "@/lib/worker/normalize";
import { loadFirstBuyersForTokens } from "@/lib/worker/repositories/first-buyers";
import { loadProductionState } from "@/lib/worker/repositories/production-state";
import type { WorkerSupabase } from "@/lib/worker/supabase";

/** Page size when scanning continuation events in firing order. */
export const CONTINUATION_COHORT_EVENT_PAGE_SIZE = 100 as const;

/** Max event pages to scan while filling a 20-member cohort (safety bound). */
export const CONTINUATION_COHORT_MAX_EVENT_PAGES = 50 as const;

type EventDbRow = {
  id: string;
  token_address: string;
  market_address: string;
  occurred_at: string;
  trigger_tx_hash: string | null;
  trigger_block_number: number | string;
  token_age_seconds: number | string;
  new_buyers: number | string;
  payload: Record<string, unknown> | null;
};

type LaunchDbRow = {
  token_address: string;
  market_address: string;
  factory_address: string;
  factory_version: string;
  launch_block_number: number | string;
  launch_block_timestamp: string;
  launch_tx_hash: string;
};

function mapEvent(row: EventDbRow): ContinuationCohortEventRow {
  return {
    id: String(row.id),
    tokenAddress: normalizeAddress(row.token_address),
    marketAddress: normalizeAddress(row.market_address),
    occurredAt: row.occurred_at,
    triggerTxHash: row.trigger_tx_hash
      ? normalizeTxHash(row.trigger_tx_hash)
      : null,
    triggerBlockNumber: Number(row.trigger_block_number),
    tokenAgeSeconds: Number(row.token_age_seconds),
    newBuyers: Number(row.new_buyers),
    payload:
      row.payload && typeof row.payload === "object" ? row.payload : {},
  };
}

function mapLaunch(row: LaunchDbRow): ContinuationCohortLaunchRow {
  return {
    tokenAddress: normalizeAddress(row.token_address),
    marketAddress: normalizeAddress(row.market_address),
    factoryAddress: normalizeAddress(row.factory_address),
    factoryVersion: String(row.factory_version),
    launchBlockNumber: Number(row.launch_block_number),
    launchBlockTimestamp: row.launch_block_timestamp,
    launchTxHash: normalizeTxHash(row.launch_tx_hash),
  };
}

/**
 * Load pons_buyer_continuation events in deterministic firing order.
 * Order: occurred_at ASC, trigger_block_number ASC, id ASC.
 * Read-only SELECT.
 */
export async function loadContinuationEventsOrdered(
  supabase: WorkerSupabase,
  chainId: number,
  opts?: { limit?: number; offset?: number },
): Promise<ContinuationCohortEventRow[]> {
  const limit = opts?.limit ?? CONTINUATION_COHORT_EVENT_PAGE_SIZE;
  const offset = opts?.offset ?? 0;

  const { data, error } = await supabase
    .from("events")
    .select(
      [
        "id",
        "token_address",
        "market_address",
        "occurred_at",
        "trigger_tx_hash",
        "trigger_block_number",
        "token_age_seconds",
        "new_buyers",
        "payload",
      ].join(", "),
    )
    .eq("chain_id", chainId)
    .eq("event_type", CONTINUATION_EVENT_TYPE)
    .order("occurred_at", { ascending: true })
    .order("trigger_block_number", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(
      `[4663-worker] loadContinuationEventsOrdered failed: ${error.message}`,
    );
  }

  return ((data ?? []) as unknown as EventDbRow[]).map(mapEvent);
}

/**
 * Load pons_launches rows for tokens (any lifecycle status). Read-only SELECT.
 */
export async function loadLaunchesByTokenAddresses(
  supabase: WorkerSupabase,
  chainId: number,
  tokenAddresses: string[],
): Promise<Map<string, ContinuationCohortLaunchRow>> {
  const out = new Map<string, ContinuationCohortLaunchRow>();
  if (tokenAddresses.length === 0) return out;

  const unique = [...new Set(tokenAddresses.map(normalizeAddress))];
  const BATCH = 100;

  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from("pons_launches")
      .select(
        [
          "token_address",
          "market_address",
          "factory_address",
          "factory_version",
          "launch_block_number",
          "launch_block_timestamp",
          "launch_tx_hash",
        ].join(", "),
      )
      .eq("chain_id", chainId)
      .in("token_address", batch);

    if (error) {
      throw new Error(
        `[4663-worker] loadLaunchesByTokenAddresses failed: ${error.message}`,
      );
    }

    for (const row of (data ?? []) as unknown as LaunchDbRow[]) {
      const mapped = mapLaunch(row);
      out.set(mapped.tokenAddress, mapped);
    }
  }

  return out;
}

export type LoadContinuationCohortResult =
  | { ok: true; report: CohortReport; observationVersion: string | null }
  | { ok: false; error: string };

/**
 * Assemble the first N qualifying PONS CONTINUATION events for manual review.
 * Completely read-only: production_state + events + pons_launches + pons_first_buyers.
 */
export async function loadContinuationValidationCohort(
  supabase: WorkerSupabase,
  chainId: number,
  opts?: { targetSize?: number },
): Promise<LoadContinuationCohortResult> {
  const targetSize = opts?.targetSize ?? CONTINUATION_COHORT_TARGET;

  const production = await loadProductionState(supabase, chainId);
  if (!production) {
    return {
      ok: false,
      error: "production_state missing — cutover required before cohort report",
    };
  }

  const gate = requireObservationActive(production.observationStartBlock);
  if (!gate.ok) {
    return { ok: false, error: gate.error };
  }

  const observationStartBlock = gate.observationStartBlock;
  const collectedEvents: ContinuationCohortEventRow[] = [];
  const launchesByToken = new Map<string, ContinuationCohortLaunchRow>();

  // Scan events in firing order until we can fill the cohort (or exhaust).
  // We may need more than targetSize raw events if pre-observation launches are mixed in.
  for (let page = 0; page < CONTINUATION_COHORT_MAX_EVENT_PAGES; page++) {
    const offset = page * CONTINUATION_COHORT_EVENT_PAGE_SIZE;
    const pageEvents = await loadContinuationEventsOrdered(supabase, chainId, {
      limit: CONTINUATION_COHORT_EVENT_PAGE_SIZE,
      offset,
    });
    if (pageEvents.length === 0) break;

    collectedEvents.push(...pageEvents);

    const missingTokens = [
      ...new Set(
        pageEvents
          .map((e) => e.tokenAddress)
          .filter((t) => !launchesByToken.has(t)),
      ),
    ];
    if (missingTokens.length > 0) {
      const pageLaunches = await loadLaunchesByTokenAddresses(
        supabase,
        chainId,
        missingTokens,
      );
      for (const [k, v] of pageLaunches) launchesByToken.set(k, v);
    }

    // Count how many would qualify so far without buyers (boundary only).
    let qualifyingSoFar = 0;
    for (const e of collectedEvents) {
      const launch = launchesByToken.get(e.tokenAddress);
      if (launch && launch.launchBlockNumber >= observationStartBlock) {
        qualifyingSoFar += 1;
        if (qualifyingSoFar >= targetSize) break;
      }
    }
    if (qualifyingSoFar >= targetSize) break;
    if (pageEvents.length < CONTINUATION_COHORT_EVENT_PAGE_SIZE) break;
  }

  // Only fetch buyers for tokens that survive the launch boundary (and appear
  // in the eventual cohort window).
  const candidateTokens: string[] = [];
  for (const e of collectedEvents) {
    const launch = launchesByToken.get(e.tokenAddress);
    if (launch && launch.launchBlockNumber >= observationStartBlock) {
      candidateTokens.push(e.tokenAddress);
      if (candidateTokens.length >= targetSize) break;
    }
  }

  const firstBuyers = await loadFirstBuyersForTokens(
    supabase,
    chainId,
    candidateTokens,
  );

  const buyersByToken = new Map<
    string,
    ContinuationCohortFirstBuyerRow[]
  >();
  for (const b of firstBuyers) {
    const token = b.tokenAddress;
    const list = buyersByToken.get(token) ?? [];
    list.push({
      tokenAddress: b.tokenAddress,
      walletAddress: b.walletAddress,
      firstBuyTxHash: b.firstBuyTxHash,
      firstBuyBlockNumber: b.firstBuyBlockNumber,
      firstBuyBlockTimestamp: b.firstBuyBlockTimestamp,
    });
    buyersByToken.set(token, list);
  }

  const report = buildContinuationCohort({
    observationStartBlock,
    events: collectedEvents,
    launchesByToken,
    buyersByToken,
    targetSize,
  });

  return {
    ok: true,
    report,
    observationVersion: production.observationVersion,
  };
}

/** Static audit: this module's public loaders are SELECT-only by design. */
export const CONTINUATION_COHORT_READ_ONLY = true as const;
