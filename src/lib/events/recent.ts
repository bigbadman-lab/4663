/**
 * Load recent public production events for GET /api/events/recent.
 * Service-role read + explicit chain/type/source constraints.
 * Production boundary: production_state + payload launch block (RLS bypass).
 */

import {
  isProductionLaunchBlock,
  normalizePublicEvent,
} from "@/lib/events/normalize";
import type { PublicEvent, RecentPublicEventsResponse } from "@/lib/events/types";
import {
  CHAIN_ID,
  EVENT_SOURCE_PONS,
  EVENT_TYPE_PONS_BUYING_ACTIVITY,
} from "@/lib/pons/constants";
import type { SupabaseClient } from "@supabase/supabase-js";

export const RECENT_EVENTS_DEFAULT_LIMIT = 20;
export const RECENT_EVENTS_MIN_LIMIT = 1;
export const RECENT_EVENTS_MAX_LIMIT = 50;
/** Bounded over-fetch so post-filter can still fill safeLimit when non-prod rows sit in the top window. */
export const RECENT_EVENTS_FETCH_MULTIPLIER = 4;

const SELECT_COLUMNS =
  "id, event_type, token_address, new_buyers, occurred_at, trigger_block_number, trigger_tx_hash, payload" as const;

/**
 * Parse ?limit= — default 20, clamp to [1, 50], invalid → default.
 * Non-integers are truncated when finite (e.g. 20.9 → 20); non-numeric → default.
 */
export function parseRecentEventsLimit(
  raw: string | null | undefined,
): number {
  if (raw == null || String(raw).trim() === "") {
    return RECENT_EVENTS_DEFAULT_LIMIT;
  }
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n)) return RECENT_EVENTS_DEFAULT_LIMIT;
  const i = Math.trunc(n);
  if (i < RECENT_EVENTS_MIN_LIMIT) return RECENT_EVENTS_MIN_LIMIT;
  if (i > RECENT_EVENTS_MAX_LIMIT) return RECENT_EVENTS_MAX_LIMIT;
  return i;
}

export type LoadRecentPublicEventsResult =
  | { ok: true; body: RecentPublicEventsResponse }
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

export async function loadRecentPublicEvents(
  supabase: SupabaseClient,
  limit: number,
): Promise<LoadRecentPublicEventsResult> {
  const safeLimit = parseRecentEventsLimit(String(limit));

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

  const fetchLimit = safeLimit * RECENT_EVENTS_FETCH_MULTIPLIER;

  const { data, error } = await supabase
    .from("events")
    .select(SELECT_COLUMNS)
    .eq("chain_id", CHAIN_ID)
    .eq("event_type", EVENT_TYPE_PONS_BUYING_ACTIVITY)
    .eq("source", EVENT_SOURCE_PONS)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(fetchLimit);

  if (error) {
    return { ok: false, error: "events_unavailable" };
  }

  const events: PublicEvent[] = [];
  for (const row of data ?? []) {
    if (events.length >= safeLimit) break;
    if (row === null || row === undefined || typeof row !== "object") {
      continue;
    }
    if (
      !isProductionLaunchBlock(
        (row as { payload?: unknown }).payload,
        productionStartBlock,
      )
    ) {
      continue;
    }
    const dto = normalizePublicEvent(row);
    if (dto) events.push(dto);
  }

  return { ok: true, body: { events } };
}
