/**
 * Participation Realtime Presence payload helpers.
 */

import { isParticipationColour } from "@/lib/social/colour";
import { validateDisplayName } from "@/lib/social/display-name";
import type {
  ParticipationPresencePayload,
  ParticipationSession,
} from "@/lib/social/types";
import {
  isUuid,
  normalizeSessionId,
} from "@/lib/presence/session-id";

const ALLOWED_KEYS = new Set([
  "sessionId",
  "name",
  "colour",
  "joinedAt",
]);

export function presencePayloadFromSession(
  session: ParticipationSession,
): ParticipationPresencePayload {
  return {
    sessionId: session.sessionId,
    name: session.displayName,
    colour: session.colour,
    joinedAt: session.joinedAt,
  };
}

export function normalizePresencePayload(
  raw: unknown,
): ParticipationPresencePayload | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    // Allow presence_ref from Supabase; reject other unexpected public fields.
    if (key === "presence_ref") continue;
    if (!ALLOWED_KEYS.has(key)) {
      // Still accept if required fields validate — strip extras when building.
      continue;
    }
  }

  if (!isUuid(record.sessionId)) return null;
  const sessionId = normalizeSessionId(record.sessionId);

  const nameResult = validateDisplayName(record.name);
  if (!nameResult.ok) return null;

  if (!isParticipationColour(record.colour)) return null;

  if (typeof record.joinedAt !== "string" || record.joinedAt.trim() === "") {
    return null;
  }
  if (!Number.isFinite(Date.parse(record.joinedAt))) return null;

  return {
    sessionId,
    name: nameResult.name,
    colour: record.colour,
    joinedAt: record.joinedAt,
  };
}

/**
 * Flatten Realtime presence state and dedupe by sessionId.
 * First occurrence wins (stable enough for MVP list).
 */
export function dedupeParticipantsBySessionId(
  payloads: readonly ParticipationPresencePayload[],
): ParticipationPresencePayload[] {
  const seen = new Set<string>();
  const out: ParticipationPresencePayload[] = [];
  for (const payload of payloads) {
    if (seen.has(payload.sessionId)) continue;
    seen.add(payload.sessionId);
    out.push(payload);
  }
  return out;
}

export function participantsFromPresenceState(
  state: Record<string, unknown[] | undefined>,
): ParticipationPresencePayload[] {
  const collected: ParticipationPresencePayload[] = [];
  for (const metas of Object.values(state)) {
    if (!Array.isArray(metas)) continue;
    for (const meta of metas) {
      const normalized = normalizePresencePayload(meta);
      if (normalized) collected.push(normalized);
    }
  }
  return dedupeParticipantsBySessionId(collected);
}

/** Strict public field set for tests / future gating. */
export function presencePayloadPublicKeys(
  payload: ParticipationPresencePayload,
): string[] {
  return Object.keys(payload).sort();
}
