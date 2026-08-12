/**
 * Browser-profile anonymous presence session ID (localStorage).
 */

import {
  isUuid,
  normalizeSessionId,
} from "@/lib/presence/session-id";

export const PRESENCE_SESSION_STORAGE_KEY = "4663_presence_session_id";

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/**
 * Return a valid lowercase UUID from storage, or generate and persist a new one.
 * Malformed / missing values are replaced.
 */
export function getOrCreatePresenceSessionId(
  storage: StorageLike,
  randomUUID: () => string = () => crypto.randomUUID(),
): string {
  const existing = storage.getItem(PRESENCE_SESSION_STORAGE_KEY);
  if (existing !== null && isUuid(existing)) {
    const normalized = normalizeSessionId(existing);
    if (existing !== normalized) {
      storage.setItem(PRESENCE_SESSION_STORAGE_KEY, normalized);
    }
    return normalized;
  }

  const created = normalizeSessionId(randomUUID());
  storage.setItem(PRESENCE_SESSION_STORAGE_KEY, created);
  return created;
}
