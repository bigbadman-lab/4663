/**
 * Social 4 — session-bound WATCH helpers (Presence-derived, ephemeral).
 * Keyed by public event id; not durable, not PlayHTML/Postgres.
 */

import {
  isUuid,
  normalizeSessionId,
} from "@/lib/presence/session-id";
import type { ParticipationPresencePayload } from "@/lib/social/types";

/**
 * Cap watched IDs per session. Live canvas shows ≤6 objects; leave a little
 * headroom without unbounded Presence metadata.
 */
export const MAX_WATCHED_EVENTS_PER_SESSION = 8 as const;

export function normalizeWatchedEventId(raw: unknown): string | null {
  if (!isUuid(raw)) return null;
  return normalizeSessionId(raw);
}

/**
 * Validate + dedupe + cap. Invalid entries dropped; excess truncated
 * (first-seen order preserved).
 */
export function normalizeWatchedEventIds(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (out.length >= MAX_WATCHED_EVENTS_PER_SESSION) break;
    const id = normalizeWatchedEventId(item);
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function isWatchingEvent(
  watchedEventIds: readonly string[],
  eventId: string,
): boolean {
  const id = normalizeWatchedEventId(eventId);
  if (!id) return false;
  return watchedEventIds.includes(id);
}

export function addWatchedEventId(
  watchedEventIds: readonly string[],
  eventId: string,
): string[] {
  const id = normalizeWatchedEventId(eventId);
  if (!id) return [...watchedEventIds];
  if (watchedEventIds.includes(id)) return [...watchedEventIds];
  if (watchedEventIds.length >= MAX_WATCHED_EVENTS_PER_SESSION) {
    return [...watchedEventIds];
  }
  return [...watchedEventIds, id];
}

export function removeWatchedEventId(
  watchedEventIds: readonly string[],
  eventId: string,
): string[] {
  const id = normalizeWatchedEventId(eventId);
  if (!id) return [...watchedEventIds];
  return watchedEventIds.filter((x) => x !== id);
}

export function toggleWatchedEventId(
  watchedEventIds: readonly string[],
  eventId: string,
): { next: string[]; watching: boolean } {
  if (isWatchingEvent(watchedEventIds, eventId)) {
    return {
      next: removeWatchedEventId(watchedEventIds, eventId),
      watching: false,
    };
  }
  const next = addWatchedEventId(watchedEventIds, eventId);
  return {
    next,
    watching: isWatchingEvent(next, eventId),
  };
}

/** Drop IDs that are no longer in the live watchable set. */
export function pruneWatchedEventIds(
  watchedEventIds: readonly string[],
  liveEventIds: ReadonlySet<string> | readonly string[],
): string[] {
  const live =
    liveEventIds instanceof Set
      ? liveEventIds
      : new Set(
          [...liveEventIds]
            .map((id) => normalizeWatchedEventId(id))
            .filter((id): id is string => id !== null),
        );
  return watchedEventIds.filter((id) => live.has(id));
}

/**
 * Distinct named participation sessions currently watching eventId.
 * Uses existing participant dedupe; one session ≤ one count.
 */
export function watchCountForEvent(
  participants: readonly ParticipationPresencePayload[],
  eventId: string,
): number {
  const id = normalizeWatchedEventId(eventId);
  if (!id) return 0;
  let count = 0;
  const seen = new Set<string>();
  for (const p of participants) {
    if (seen.has(p.sessionId)) continue;
    seen.add(p.sessionId);
    if (p.watchedEventIds.includes(id)) count += 1;
  }
  return count;
}
