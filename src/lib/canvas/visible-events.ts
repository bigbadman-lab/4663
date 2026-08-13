/**
 * Stage 10B / Social 7 — which live stream events appear as canvas objects.
 * UI visibility only; does not change Stage 9 stream / worker semantics.
 */

import { comparePublicEvents } from "@/lib/events/merge";
import type { PublicEvent } from "@/lib/events/types";

/**
 * Wall-clock LIVE window (ms) from event.occurredAt.
 * LIVE iff 0 <= age < LIVE_OBJECT_MAX_AGE_MS (exactly 10m → not LIVE).
 */
export const LIVE_OBJECT_MAX_AGE_MS = 10 * 60 * 1000;

export const LIVE_OBJECT_MAX_VISIBLE_DESKTOP = 6;
export const LIVE_OBJECT_MAX_VISIBLE_NARROW = 4;

export const LIVE_OBJECT_AGE_TICK_MS = 2_000;

export function eventAgeMs(event: PublicEvent, nowMs: number): number {
  const occurred = Date.parse(event.occurredAt);
  if (Number.isNaN(occurred)) return Number.POSITIVE_INFINITY;
  return nowMs - occurred;
}

/** Include when 0 <= age < maxAgeMs. Exactly maxAgeMs is not LIVE. */
export function isEventVisibleByAge(
  event: PublicEvent,
  nowMs: number,
  maxAgeMs: number = LIVE_OBJECT_MAX_AGE_MS,
): boolean {
  const age = eventAgeMs(event, nowMs);
  return age >= 0 && age < maxAgeMs;
}

/** Newest first: reverse of stream ascending order. */
export function comparePublicEventsNewestFirst(
  a: PublicEvent,
  b: PublicEvent,
): number {
  return comparePublicEvents(b, a);
}

/**
 * Filter by LIVE wall age, sort newest-first, take maxVisible.
 */
export function selectVisibleLiveEvents(
  events: readonly PublicEvent[],
  nowMs: number,
  maxVisible: number = LIVE_OBJECT_MAX_VISIBLE_DESKTOP,
  maxAgeMs: number = LIVE_OBJECT_MAX_AGE_MS,
): PublicEvent[] {
  const cap = Math.max(0, Math.trunc(maxVisible));
  if (cap === 0) return [];

  const eligible = events.filter((event) =>
    isEventVisibleByAge(event, nowMs, maxAgeMs),
  );
  eligible.sort(comparePublicEventsNewestFirst);
  return eligible.slice(0, cap);
}
