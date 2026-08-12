/**
 * Stage 10B — which live stream events appear as canvas objects.
 * UI visibility only; does not change Stage 9 stream semantics.
 */

import { comparePublicEvents } from "@/lib/events/merge";
import type { PublicEvent } from "@/lib/events/types";

/** Wall-clock age window for on-canvas visibility (ms). Inclusive at boundary. */
export const LIVE_OBJECT_MAX_AGE_MS = 90_000;

export const LIVE_OBJECT_MAX_VISIBLE_DESKTOP = 6;
export const LIVE_OBJECT_MAX_VISIBLE_NARROW = 4;

export const LIVE_OBJECT_AGE_TICK_MS = 2_000;

export function eventAgeMs(event: PublicEvent, nowMs: number): number {
  const occurred = Date.parse(event.occurredAt);
  if (Number.isNaN(occurred)) return Number.POSITIVE_INFINITY;
  return nowMs - occurred;
}

/** Include when 0 <= age <= maxAgeMs. Future / invalid timestamps excluded. */
export function isEventVisibleByAge(
  event: PublicEvent,
  nowMs: number,
  maxAgeMs: number = LIVE_OBJECT_MAX_AGE_MS,
): boolean {
  const age = eventAgeMs(event, nowMs);
  return age >= 0 && age <= maxAgeMs;
}

/** Newest first: reverse of stream ascending order. */
export function comparePublicEventsNewestFirst(
  a: PublicEvent,
  b: PublicEvent,
): number {
  return comparePublicEvents(b, a);
}

/**
 * Filter by 90s wall age, sort newest-first, take maxVisible.
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
