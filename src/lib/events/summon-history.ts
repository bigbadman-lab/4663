/**
 * Stage 8A.7 — load verified historical pons_buyer_continuation for Summon.
 * Service-role read. Does not mutate worker/Candidate B firing.
 */

import {
  isProductionLaunchBlock,
  normalizeSummonHistoryEvent,
  safeLaunchBlockFromPayload,
} from "@/lib/events/normalize";
import {
  isSummonEligibleLaunchBlock,
  verifyContinuationEventIntegrity,
  type SummonIntegrityReport,
} from "@/lib/events/summon-integrity";
import type {
  SummonHistoryEvent,
  SummonHistoryEventsResponse,
} from "@/lib/events/types";
import {
  CHAIN_ID,
  EVENT_SOURCE_PONS,
  EVENT_TYPE_PONS_BUYER_CONTINUATION,
} from "@/lib/pons/constants";
import type { SupabaseClient } from "@supabase/supabase-js";

export const SUMMON_HISTORY_DEFAULT_LIMIT = 20;
export const SUMMON_HISTORY_MIN_LIMIT = 1;
export const SUMMON_HISTORY_MAX_LIMIT = 50;
/** Over-fetch raw continuation rows before integrity filtering. */
export const SUMMON_HISTORY_FETCH_MULTIPLIER = 4 as const;

const SELECT_COLUMNS =
  "id, event_type, token_address, new_buyers, occurred_at, trigger_block_number, trigger_tx_hash, payload" as const;

export type LoadSummonHistoryResult =
  | {
      ok: true;
      body: SummonHistoryEventsResponse;
      integrity: {
        checked: number;
        passed: number;
        failed: number;
        reports: SummonIntegrityReport[];
      };
    }
  | { ok: false; error: "events_unavailable" };

function asProductionStartBlock(value: unknown): bigint | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    if (!Number.isInteger(value)) return null;
    return BigInt(value);
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value.trim())) {
    try {
      return BigInt(value.trim());
    } catch {
      return null;
    }
  }
  return null;
}

function asNullableInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

export function parseSummonHistoryLimit(
  raw: string | null | undefined,
): number {
  if (raw == null || String(raw).trim() === "") {
    return SUMMON_HISTORY_DEFAULT_LIMIT;
  }
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n)) {
    return SUMMON_HISTORY_DEFAULT_LIMIT;
  }
  const i = Math.trunc(n);
  if (i < SUMMON_HISTORY_MIN_LIMIT) return SUMMON_HISTORY_MIN_LIMIT;
  if (i > SUMMON_HISTORY_MAX_LIMIT) return SUMMON_HISTORY_MAX_LIMIT;
  return i;
}

type LaunchRow = {
  token_address: string;
  launch_block_number: number | string;
  launch_block_timestamp: string;
};

type BuyerRow = {
  token_address: string;
  first_buy_block_timestamp: string;
  first_buy_tx_hash: string;
};

async function loadLaunchesByTokens(
  supabase: SupabaseClient,
  tokens: string[],
): Promise<Map<string, LaunchRow>> {
  const out = new Map<string, LaunchRow>();
  if (tokens.length === 0) return out;
  const { data, error } = await supabase
    .from("pons_launches")
    .select("token_address, launch_block_number, launch_block_timestamp")
    .eq("chain_id", CHAIN_ID)
    .in("token_address", tokens);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as LaunchRow[]) {
    out.set(String(row.token_address).toLowerCase(), row);
  }
  return out;
}

async function loadBuyersByTokens(
  supabase: SupabaseClient,
  tokens: string[],
): Promise<Map<string, BuyerRow[]>> {
  const out = new Map<string, BuyerRow[]>();
  if (tokens.length === 0) return out;
  const { data, error } = await supabase
    .from("pons_first_buyers")
    .select("token_address, first_buy_block_timestamp, first_buy_tx_hash")
    .eq("chain_id", CHAIN_ID)
    .in("token_address", tokens);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as BuyerRow[]) {
    const key = String(row.token_address).toLowerCase();
    const list = out.get(key) ?? [];
    list.push(row);
    out.set(key, list);
  }
  return out;
}

/**
 * Newest-first verified Summon history (continuation only).
 * Excludes buying activity, pre-boundary, and Candidate B FAIL rows.
 */
export async function loadSummonHistoryEvents(
  supabase: SupabaseClient,
  limit: number,
): Promise<LoadSummonHistoryResult> {
  const safeLimit = parseSummonHistoryLimit(String(limit));

  const { data: stateRow, error: stateError } = await supabase
    .from("production_state")
    .select("production_start_block, observation_start_block")
    .eq("chain_id", CHAIN_ID)
    .maybeSingle();

  if (stateError) {
    return { ok: false, error: "events_unavailable" };
  }

  const productionStartBlock = asProductionStartBlock(
    stateRow?.production_start_block,
  );
  if (productionStartBlock === null) {
    return { ok: false, error: "events_unavailable" };
  }
  const observationStartBlock = asNullableInt(
    stateRow?.observation_start_block ?? null,
  );

  const fetchLimit = safeLimit * SUMMON_HISTORY_FETCH_MULTIPLIER;

  const { data, error } = await supabase
    .from("events")
    .select(SELECT_COLUMNS)
    .eq("chain_id", CHAIN_ID)
    .eq("event_type", EVENT_TYPE_PONS_BUYER_CONTINUATION)
    .eq("source", EVENT_SOURCE_PONS)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(fetchLimit);

  if (error) {
    return { ok: false, error: "events_unavailable" };
  }

  type Candidate = {
    row: Record<string, unknown>;
    dto: SummonHistoryEvent;
    payload: unknown;
  };

  const candidates: Candidate[] = [];
  for (const row of data ?? []) {
    if (row === null || row === undefined || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const payload = record.payload;
    if (!isProductionLaunchBlock(payload, productionStartBlock)) continue;
    const launchBlock = safeLaunchBlockFromPayload(payload);
    if (launchBlock === null) continue;
    if (
      !isSummonEligibleLaunchBlock(
        Number(launchBlock),
        productionStartBlock,
        observationStartBlock,
      )
    ) {
      continue;
    }
    const dto = normalizeSummonHistoryEvent(row);
    if (!dto) continue;
    candidates.push({ row: record, dto, payload });
  }

  if (candidates.length === 0) {
    return {
      ok: true,
      body: { events: [] },
      integrity: { checked: 0, passed: 0, failed: 0, reports: [] },
    };
  }

  const tokens = [...new Set(candidates.map((c) => c.dto.tokenAddress))];

  let launches: Map<string, LaunchRow>;
  let buyers: Map<string, BuyerRow[]>;
  try {
    launches = await loadLaunchesByTokens(supabase, tokens);
    buyers = await loadBuyersByTokens(supabase, tokens);
  } catch {
    return { ok: false, error: "events_unavailable" };
  }

  const events: SummonHistoryEvent[] = [];
  const reports: SummonIntegrityReport[] = [];
  let passed = 0;
  let failed = 0;

  for (const candidate of candidates) {
    if (events.length >= safeLimit) break;
    const launch = launches.get(candidate.dto.tokenAddress) ?? null;
    const report = verifyContinuationEventIntegrity({
      event: {
        id: candidate.dto.id,
        tokenAddress: candidate.dto.tokenAddress,
        occurredAt: candidate.dto.occurredAt,
        triggerTxHash: candidate.dto.triggerTxHash,
      },
      launch: launch
        ? {
            tokenAddress: candidate.dto.tokenAddress,
            launchBlockNumber: Number(launch.launch_block_number),
            launchBlockTimestamp: launch.launch_block_timestamp,
          }
        : null,
      buyers: (buyers.get(candidate.dto.tokenAddress) ?? []).map((b) => ({
        firstBuyBlockTimestamp: b.first_buy_block_timestamp,
        firstBuyTxHash: b.first_buy_tx_hash,
      })),
      productionStartBlock,
      observationStartBlock,
    });
    reports.push(report);
    if (report.status === "PASS") {
      passed += 1;
      events.push(candidate.dto);
    } else {
      failed += 1;
    }
  }

  return {
    ok: true,
    body: { events },
    integrity: {
      checked: reports.length,
      passed,
      failed,
      reports,
    },
  };
}
