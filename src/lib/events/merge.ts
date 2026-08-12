/**
 * Pure merge / order / cap for the public event stream store.
 */

import type { PublicEvent } from "@/lib/events/types";

export const MAX_PUBLIC_EVENTS = 100;

/** Ascending occurredAt, then id — append-friendly for Stage 10. */
export function comparePublicEvents(a: PublicEvent, b: PublicEvent): number {
  const byTime = a.occurredAt.localeCompare(b.occurredAt);
  if (byTime !== 0) return byTime;
  return a.id.localeCompare(b.id);
}

/**
 * Merge by id, sort ascending, drop oldest when over MAX_PUBLIC_EVENTS.
 */
export function mergePublicEvents(
  existing: readonly PublicEvent[],
  incoming: readonly PublicEvent[],
): PublicEvent[] {
  const map = new Map<string, PublicEvent>();
  for (const event of existing) {
    map.set(event.id, event);
  }
  for (const event of incoming) {
    map.set(event.id, event);
  }

  const sorted = [...map.values()].sort(comparePublicEvents);
  if (sorted.length <= MAX_PUBLIC_EVENTS) return sorted;
  return sorted.slice(sorted.length - MAX_PUBLIC_EVENTS);
}
