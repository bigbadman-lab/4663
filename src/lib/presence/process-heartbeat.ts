/**
 * Presence heartbeat request handling (testable without Next runtime).
 */

import { deriveCoarseGeoFromHeaders } from "@/lib/presence/geo";
import {
  isUuid,
  normalizeSessionId,
} from "@/lib/presence/session-id";
import type { PresenceSupabase } from "@/lib/presence/supabase-server";
import { upsertPresenceHeartbeat } from "@/lib/presence/upsert";

export type HeartbeatSuccess = { ok: true };
export type HeartbeatFailure =
  | { ok: false; status: 400; error: string }
  | { ok: false; status: 500; error: string };

export type HeartbeatResult = HeartbeatSuccess | HeartbeatFailure;

/**
 * Parse JSON body, validate sessionId, derive geo from headers, upsert presence.
 * Ignores any client-supplied country/city/IP/geo fields.
 */
export async function processPresenceHeartbeat(input: {
  body: unknown;
  headers: Headers;
  supabase: PresenceSupabase;
  /** Injectable clock for tests; defaults to Date.now ISO. */
  nowIso?: string;
}): Promise<HeartbeatResult> {
  if (input.body === null || typeof input.body !== "object" || Array.isArray(input.body)) {
    return { ok: false, status: 400, error: "invalid_body" };
  }

  const record = input.body as Record<string, unknown>;
  const sessionIdRaw = record.sessionId;

  if (sessionIdRaw === undefined || sessionIdRaw === null) {
    return { ok: false, status: 400, error: "missing_session_id" };
  }

  if (!isUuid(sessionIdRaw)) {
    return { ok: false, status: 400, error: "invalid_session_id" };
  }

  const sessionId = normalizeSessionId(sessionIdRaw);
  const geo = deriveCoarseGeoFromHeaders(input.headers);
  const seenAtIso = input.nowIso ?? new Date().toISOString();

  try {
    await upsertPresenceHeartbeat(input.supabase, {
      sessionId,
      geo,
      seenAtIso,
    });
  } catch {
    return { ok: false, status: 500, error: "upsert_failed" };
  }

  return { ok: true };
}
