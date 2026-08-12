/**
 * Tab-scoped named participation identity (sessionStorage).
 * Do not use localStorage or 4663_presence_session_id.
 */

import {
  colourFromSessionId,
  isParticipationColour,
} from "@/lib/social/colour";
import { validateDisplayName } from "@/lib/social/display-name";
import type { ParticipationSession } from "@/lib/social/types";
import {
  isUuid,
  normalizeSessionId,
} from "@/lib/presence/session-id";

export const PARTICIPATION_SESSION_STORAGE_KEY =
  "4663_participation_session" as const;

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

export function parseParticipationSession(
  raw: unknown,
): ParticipationSession | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  if (!isUuid(record.sessionId)) return null;
  const sessionId = normalizeSessionId(record.sessionId);

  const nameResult = validateDisplayName(record.displayName);
  if (!nameResult.ok) return null;

  if (!isParticipationColour(record.colour)) return null;
  // Colour must match deterministic assignment for this session id.
  if (record.colour !== colourFromSessionId(sessionId)) return null;

  if (!isIsoTimestamp(record.joinedAt)) return null;

  return {
    sessionId,
    displayName: nameResult.name,
    colour: record.colour,
    joinedAt: record.joinedAt,
  };
}

export function readParticipationSession(
  storage: StorageLike,
): ParticipationSession | null {
  const raw = storage.getItem(PARTICIPATION_SESSION_STORAGE_KEY);
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    storage.removeItem(PARTICIPATION_SESSION_STORAGE_KEY);
    return null;
  }

  const session = parseParticipationSession(parsed);
  if (!session) {
    storage.removeItem(PARTICIPATION_SESSION_STORAGE_KEY);
    return null;
  }
  return session;
}

export function writeParticipationSession(
  storage: StorageLike,
  session: ParticipationSession,
): void {
  storage.setItem(
    PARTICIPATION_SESSION_STORAGE_KEY,
    JSON.stringify(session),
  );
}

export function clearParticipationSession(storage: StorageLike): void {
  storage.removeItem(PARTICIPATION_SESSION_STORAGE_KEY);
}

export type CreateParticipationSessionInput = {
  displayName: string;
  now?: () => Date;
  randomUUID?: () => string;
};

export type CreateParticipationSessionResult =
  | { ok: true; session: ParticipationSession }
  | { ok: false; error: string };

/**
 * Create a new tab-scoped participation session from a chosen display name.
 */
export function createParticipationSession(
  input: CreateParticipationSessionInput,
): CreateParticipationSessionResult {
  const nameResult = validateDisplayName(input.displayName);
  if (!nameResult.ok) {
    return { ok: false, error: nameResult.error };
  }

  const randomUUID = input.randomUUID ?? (() => crypto.randomUUID());
  const now = input.now ?? (() => new Date());
  const sessionId = normalizeSessionId(randomUUID());
  const session: ParticipationSession = {
    sessionId,
    displayName: nameResult.name,
    colour: colourFromSessionId(sessionId),
    joinedAt: now().toISOString(),
  };
  return { ok: true, session };
}

/**
 * Persist a newly created session. Returns the stored session.
 */
export function enterParticipationSession(
  storage: StorageLike,
  input: CreateParticipationSessionInput,
): CreateParticipationSessionResult {
  const created = createParticipationSession(input);
  if (!created.ok) return created;
  writeParticipationSession(storage, created.session);
  return created;
}

/**
 * Clear named participation from storage (local leave primitive).
 */
export function leaveParticipationSession(storage: StorageLike): void {
  clearParticipationSession(storage);
}
