/**
 * Stage 10B.9 / Social 5 / Stage 8A.7 — SUMMON pure helpers.
 * Selection, slots, resolve, duplicate suppression.
 * Active batch lifetime is session-bound (see active-summon.ts page data).
 * SUMMON_LIFETIME_MS is retained only as a deprecated constant for tests
 * that assert it no longer drives active lifetime.
 *
 * Stage 8A.7: selects verified pons_buyer_continuation history only (max 4).
 */

import type { CanvasSlot } from "@/lib/canvas/slots";
import {
  comparePublicEventsNewestFirst,
  isEventVisibleByAge,
  LIVE_OBJECT_MAX_AGE_MS,
} from "@/lib/canvas/visible-events";
import {
  PUBLIC_EVENT_TYPE_PONS_BUYER_CONTINUATION,
  type PublicEvent,
} from "@/lib/events/types";

/** @deprecated Social 5 — active SUMMON is session-bound; do not use for lifetime. */
export const SUMMON_LIFETIME_MS = 20_000 as const;

/** Canonical Summon batch size — do not scatter literals. */
export const SUMMON_MAX_EVENTS = 4 as const;
export const SUMMON_COOLDOWN_MS = 4_000 as const;

/** Four sparse mid-canvas origins — independent of live CANVAS_SLOTS. */
export const SUMMON_SLOTS: readonly CanvasSlot[] = [
  { id: "summon-0", leftPct: 18, topPct: 26 },
  { id: "summon-1", leftPct: 68, topPct: 24 },
  { id: "summon-2", leftPct: 28, topPct: 52 },
  { id: "summon-3", leftPct: 74, topPct: 56 },
] as const;

export function playhtmlSummonedElementId(
  summonId: string,
  eventId: string,
): string {
  return `4663-summoned-${summonId}-${eventId}`;
}

export function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function canDispatchSummon(
  lastDispatchAt: number | null,
  nowMs: number,
  cooldownMs: number = SUMMON_COOLDOWN_MS,
): boolean {
  if (lastDispatchAt === null) return true;
  return nowMs - lastDispatchAt >= cooldownMs;
}

/** Summon may only select public historical continuation events. */
export function isSummonEligibleEventType(
  event: Pick<PublicEvent, "type">,
): boolean {
  return event.type === PUBLIC_EVENT_TYPE_PONS_BUYER_CONTINUATION;
}

/**
 * Newest-first historical continuation ids, excluding currently-live (<10m).
 * Returns up to SUMMON_MAX_EVENTS (may be fewer if history is thin).
 * Never selects pons_buying_activity or other types.
 */
export function selectSummonEventIds(
  events: readonly PublicEvent[],
  nowMs: number,
  maxCount: number = SUMMON_MAX_EVENTS,
  liveMaxAgeMs: number = LIVE_OBJECT_MAX_AGE_MS,
): string[] {
  const cap = Math.max(0, Math.trunc(maxCount));
  if (cap === 0) return [];

  const eligible = events.filter(isSummonEligibleEventType);

  const liveIds = new Set(
    eligible
      .filter((event) => isEventVisibleByAge(event, nowMs, liveMaxAgeMs))
      .map((event) => event.id),
  );

  const historical = eligible.filter((event) => !liveIds.has(event.id));
  historical.sort(comparePublicEventsNewestFirst);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const event of historical) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    out.push(event.id);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Resolve payload ids from known events, preserving payload order.
 * Optionally merge a one-shot recovery map for missing ids.
 */
export function resolveSummonEvents(
  eventIds: readonly string[],
  localEvents: readonly PublicEvent[],
  recoveryEvents: readonly PublicEvent[] = [],
): PublicEvent[] {
  const map = new Map<string, PublicEvent>();
  for (const event of localEvents) {
    map.set(event.id, event);
    map.set(event.id.toLowerCase(), event);
  }
  for (const event of recoveryEvents) {
    if (!map.has(event.id)) map.set(event.id, event);
    if (!map.has(event.id.toLowerCase())) {
      map.set(event.id.toLowerCase(), event);
    }
  }

  const out: PublicEvent[] = [];
  for (const id of eventIds) {
    const event = map.get(id) ?? map.get(id.toLowerCase());
    if (event && isSummonEligibleEventType(event)) out.push(event);
  }
  return out;
}

/** Drop summoned events that are currently live on this client. */
export function suppressLiveDuplicates(
  events: readonly PublicEvent[],
  liveIds: ReadonlySet<string>,
): PublicEvent[] {
  return events.filter((event) => !liveIds.has(event.id));
}

/**
 * Assign fixed SUMMON_SLOTS by event order — deterministic for late join
 * when eventIds order is shared.
 */
export function assignSummonSlots(
  events: readonly PublicEvent[],
  slots: readonly CanvasSlot[] = SUMMON_SLOTS,
): Array<{ event: PublicEvent; slot: CanvasSlot }> {
  const out: Array<{ event: PublicEvent; slot: CanvasSlot }> = [];
  for (let i = 0; i < events.length && i < slots.length; i += 1) {
    out.push({ event: events[i]!, slot: slots[i]! });
  }
  return out;
}
