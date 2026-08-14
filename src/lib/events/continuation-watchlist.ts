/**
 * Server read-model: today's UTC pons_buyer_continuation watchlist (max 5).
 * Presentation only — does not alter Candidate B / fire RPC / worker.
 */

import {
  isProductionLaunchBlock,
  safeLaunchBlockFromPayload,
} from "@/lib/events/normalize";
import {
  CHAIN_ID,
  EVENT_SOURCE_PONS,
  EVENT_TYPE_PONS_BUYER_CONTINUATION,
} from "@/lib/pons/constants";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Max tokens returned to the public monitoring object. */
export const CONTINUATION_WATCHLIST_LIMIT = 5 as const;

/**
 * Over-fetch before production-boundary post-filter so we can still fill 5.
 * Same pattern as recent/summon loaders.
 */
export const CONTINUATION_WATCHLIST_FETCH_MULTIPLIER = 4 as const;

/** Bound for today's qualification feed used by live RADAR alerts. */
export const RADAR_RECENT_QUALIFICATIONS_LIMIT = 50 as const;

const SELECT_COLUMNS =
  "id, event_type, token_address, market_address, occurred_at, new_buyers, payload" as const;

export type ContinuationWatchlistToken = {
  /** Durable events.id for RADAR-entry detection. */
  eventId: string;
  tokenAddress: string;
  marketAddress: string | null;
  launchTimestamp: string | null;
  continuationTimestamp: string;
  /** Continuation-window first buyers (events.new_buyers / payload.continuation_buyers). */
  continuationBuyerCount: number;
  pre3mFirstBuyers: number | null;
  continuationFirstBuyers: number | null;
};

/** Lightweight today's qualification for live RADAR alerts (not the ranked top-5). */
export type RadarQualificationRef = {
  eventId: string;
  tokenAddress: string;
  occurredAt: string;
};

export type ContinuationWatchlistResponse = {
  generatedAt: string;
  /** UTC day start used for the query (ISO). */
  dayStartUtc: string;
  tokens: ContinuationWatchlistToken[];
  /**
   * Today's continuation qualifications (newest first, bounded).
   * Used for live RADAR alerts — independent of top-5 strength ranking.
   */
  recentQualifications: RadarQualificationRef[];
};

export type LoadContinuationWatchlistResult =
  | { ok: true; body: ContinuationWatchlistResponse }
  | { ok: false; error: "events_unavailable" };

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;

/**
 * UTC calendar-day bounds for "today".
 * Filtering uses continuation `occurred_at` (second continuation first-buy),
 * not launch time — that is when the token crossed Candidate B.
 */
export function utcDayBounds(nowMs: number): {
  startMs: number;
  endMs: number;
  startIso: string;
  endIso: string;
} {
  const d = new Date(nowMs);
  const startMs = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
  );
  const endMs = startMs + 24 * 60 * 60 * 1000;
  return {
    startMs,
    endMs,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

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

function asPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 1 && Math.trunc(n) === n) {
      return Math.trunc(n);
    }
  }
  return null;
}

function asNonNegInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0 && Math.trunc(n) === n) {
      return Math.trunc(n);
    }
  }
  return null;
}

function toIso(value: unknown): string | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    if (Number.isNaN(ms)) return null;
    return value.toISOString();
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function normalizeMarketAddress(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "") return null;
  if (!ADDRESS_RE.test(normalized)) return null;
  return normalized;
}

function payloadBuyerCounts(payload: unknown): {
  pre3m: number | null;
  continuation: number | null;
} {
  if (payload === null || payload === undefined) {
    return { pre3m: null, continuation: null };
  }
  if (typeof payload !== "object" || Array.isArray(payload)) {
    return { pre3m: null, continuation: null };
  }
  const record = payload as Record<string, unknown>;
  return {
    pre3m: asNonNegInt(record.pre_3m_buyers),
    continuation: asPositiveInt(record.continuation_buyers),
  };
}

type RawContinuationRow = {
  id?: unknown;
  event_type?: unknown;
  token_address?: unknown;
  market_address?: unknown;
  occurred_at?: unknown;
  new_buyers?: unknown;
  payload?: unknown;
};

type NormalizedContinuationRow = {
  eventId: string;
  tokenAddress: string;
  marketAddress: string | null;
  continuationTimestamp: string;
  continuationBuyerCount: number;
  pre3mFirstBuyers: number | null;
  continuationFirstBuyers: number | null;
  payload: unknown;
};

/**
 * Rank: stronger continuation buyer count, then most recent continuation,
 * then token address (deterministic).
 */
export function compareContinuationWatchlistRows(
  a: Pick<
    NormalizedContinuationRow,
    "continuationBuyerCount" | "continuationTimestamp" | "tokenAddress"
  >,
  b: Pick<
    NormalizedContinuationRow,
    "continuationBuyerCount" | "continuationTimestamp" | "tokenAddress"
  >,
): number {
  if (a.continuationBuyerCount !== b.continuationBuyerCount) {
    return b.continuationBuyerCount - a.continuationBuyerCount;
  }
  const ta = Date.parse(a.continuationTimestamp);
  const tb = Date.parse(b.continuationTimestamp);
  if (ta !== tb) return tb - ta;
  return a.tokenAddress < b.tokenAddress
    ? -1
    : a.tokenAddress > b.tokenAddress
      ? 1
      : 0;
}

export function normalizeContinuationWatchlistRow(
  row: unknown,
): NormalizedContinuationRow | null {
  if (row === null || row === undefined) return null;
  if (typeof row !== "object" || Array.isArray(row)) return null;
  const r = row as RawContinuationRow;
  if (r.event_type !== EVENT_TYPE_PONS_BUYER_CONTINUATION) return null;
  if (typeof r.id !== "string") return null;
  const eventId = r.id.trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      eventId,
    )
  ) {
    return null;
  }
  if (typeof r.token_address !== "string") return null;
  const tokenAddress = r.token_address.trim().toLowerCase();
  if (!ADDRESS_RE.test(tokenAddress)) return null;

  const continuationBuyerCount = asPositiveInt(r.new_buyers);
  if (continuationBuyerCount === null) return null;

  const continuationTimestamp = toIso(r.occurred_at);
  if (continuationTimestamp === null) return null;

  const counts = payloadBuyerCounts(r.payload);
  return {
    eventId,
    tokenAddress,
    marketAddress: normalizeMarketAddress(r.market_address),
    continuationTimestamp,
    continuationBuyerCount,
    pre3mFirstBuyers: counts.pre3m,
    continuationFirstBuyers: counts.continuation ?? continuationBuyerCount,
    payload: r.payload,
  };
}

/**
 * Deterministic WHY copy from stored continuation counts (no AI).
 */
export function continuationWhyCopy(
  continuationBuyerCount: number,
): string {
  const n = Math.max(0, Math.trunc(continuationBuyerCount));
  if (n === 1) {
    return "1 new first-time buyer arrived during the 3–5 minute continuation window.";
  }
  return `${n} new first-time buyers arrived during the 3–5 minute continuation window.`;
}

export async function loadContinuationWatchlist(
  supabase: SupabaseClient,
  nowMs: number = Date.now(),
  limit: number = CONTINUATION_WATCHLIST_LIMIT,
): Promise<LoadContinuationWatchlistResult> {
  const safeLimit = Math.min(
    CONTINUATION_WATCHLIST_LIMIT,
    Math.max(0, Math.trunc(limit)),
  );
  const { startIso, endIso } = utcDayBounds(nowMs);
  const generatedAt = new Date(nowMs).toISOString();

  const { data: stateRow, error: stateError } = await supabase
    .from("production_state")
    .select("production_start_block")
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

  const fetchLimit = Math.max(
    safeLimit * CONTINUATION_WATCHLIST_FETCH_MULTIPLIER,
    safeLimit,
  );

  const { data, error } = await supabase
    .from("events")
    .select(SELECT_COLUMNS)
    .eq("chain_id", CHAIN_ID)
    .eq("event_type", EVENT_TYPE_PONS_BUYER_CONTINUATION)
    .eq("source", EVENT_SOURCE_PONS)
    .gte("occurred_at", startIso)
    .lt("occurred_at", endIso)
    .order("new_buyers", { ascending: false })
    .order("occurred_at", { ascending: false })
    .order("token_address", { ascending: true })
    .limit(Math.max(fetchLimit, 1));

  if (error) {
    return { ok: false, error: "events_unavailable" };
  }

  const ranked: NormalizedContinuationRow[] = [];
  for (const row of data ?? []) {
    const normalized = normalizeContinuationWatchlistRow(row);
    if (!normalized) continue;
    if (!isProductionLaunchBlock(normalized.payload, productionStartBlock)) {
      continue;
    }
    // Defence: ensure payload launch block parses (same gate as other public APIs).
    if (safeLaunchBlockFromPayload(normalized.payload) === null) continue;
    ranked.push(normalized);
  }

  ranked.sort(compareContinuationWatchlistRows);
  const top = ranked.slice(0, safeLimit);

  // Separate newest-first feed for live alerts (independent of strength ranking).
  const { data: recentRows, error: recentError } = await supabase
    .from("events")
    .select("id, event_type, token_address, market_address, occurred_at, new_buyers, payload")
    .eq("chain_id", CHAIN_ID)
    .eq("event_type", EVENT_TYPE_PONS_BUYER_CONTINUATION)
    .eq("source", EVENT_SOURCE_PONS)
    .gte("occurred_at", startIso)
    .lt("occurred_at", endIso)
    .order("occurred_at", { ascending: false })
    .order("token_address", { ascending: true })
    .limit(RADAR_RECENT_QUALIFICATIONS_LIMIT);

  if (recentError) {
    return { ok: false, error: "events_unavailable" };
  }

  const recentQualifications: RadarQualificationRef[] = [];
  for (const row of recentRows ?? []) {
    const normalized = normalizeContinuationWatchlistRow(row);
    if (!normalized) continue;
    if (!isProductionLaunchBlock(normalized.payload, productionStartBlock)) {
      continue;
    }
    if (safeLaunchBlockFromPayload(normalized.payload) === null) continue;
    recentQualifications.push({
      eventId: normalized.eventId,
      tokenAddress: normalized.tokenAddress,
      occurredAt: normalized.continuationTimestamp,
    });
  }

  const launchByToken = new Map<string, string>();
  if (top.length > 0) {
    const tokens = top.map((row) => row.tokenAddress);
    const { data: launches, error: launchError } = await supabase
      .from("pons_launches")
      .select("token_address, launch_block_timestamp")
      .eq("chain_id", CHAIN_ID)
      .in("token_address", tokens);

    if (!launchError) {
      for (const launch of launches ?? []) {
        if (!launch || typeof launch !== "object") continue;
        const record = launch as {
          token_address?: unknown;
          launch_block_timestamp?: unknown;
        };
        if (typeof record.token_address !== "string") continue;
        const token = record.token_address.trim().toLowerCase();
        const ts = toIso(record.launch_block_timestamp);
        if (ts) launchByToken.set(token, ts);
      }
    }
  }

  const tokens: ContinuationWatchlistToken[] = top.map((row) => ({
    eventId: row.eventId,
    tokenAddress: row.tokenAddress,
    marketAddress: row.marketAddress,
    launchTimestamp: launchByToken.get(row.tokenAddress) ?? null,
    continuationTimestamp: row.continuationTimestamp,
    continuationBuyerCount: row.continuationBuyerCount,
    pre3mFirstBuyers: row.pre3mFirstBuyers,
    continuationFirstBuyers: row.continuationFirstBuyers,
  }));

  return {
    ok: true,
    body: {
      generatedAt,
      dayStartUtc: startIso,
      tokens,
      recentQualifications,
    },
  };
}
