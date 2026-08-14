/**
 * Live chat — server-side load/create (service-role).
 * Rate limits enforced via recent-row queries (durable across instances).
 */

import { CHAIN_ID } from "@/lib/pons/constants";
import type { PresenceSupabase } from "@/lib/presence/supabase-server";
import {
  CHAT_MESSAGES_GET_LIMIT,
  CHAT_MESSAGES_TABLE,
  CHAT_RATE_BURST_MAX,
  CHAT_RATE_BURST_WINDOW_MS,
  CHAT_RATE_MIN_INTERVAL_MS,
  chatMessageFromRow,
  parseCreateChatInput,
  type ChatMessage,
} from "@/lib/social/chat-message";

export type LoadRecentChatMessagesResult =
  | { ok: true; messages: ChatMessage[] }
  | { ok: false; error: "chat_unavailable" };

export async function loadRecentChatMessages(
  supabase: PresenceSupabase,
  now: Date = new Date(),
  limit: number = CHAT_MESSAGES_GET_LIMIT,
): Promise<LoadRecentChatMessagesResult> {
  const { data, error } = await supabase
    .from(CHAT_MESSAGES_TABLE)
    .select(
      "id, chain_id, owner_session_id, display_name, colour, body, created_at, expires_at",
    )
    .eq("chain_id", CHAIN_ID)
    .gt("expires_at", now.toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { ok: false, error: "chat_unavailable" };
  }

  const messages: ChatMessage[] = [];
  for (const row of data ?? []) {
    const message = chatMessageFromRow(row);
    if (message) messages.push(message);
  }
  // Query was newest-first; UI wants oldest → newest.
  messages.reverse();
  return { ok: true, messages };
}

export type ChatRateLimitDecision =
  | { ok: true }
  | { ok: false; error: "rate_limited" };

/**
 * Session-based rate limit using durable DB timestamps.
 * - Min 2s between accepted messages
 * - Max 5 accepted messages per 15s window
 */
export async function checkChatRateLimit(
  supabase: PresenceSupabase,
  sessionId: string,
  now: Date = new Date(),
): Promise<ChatRateLimitDecision> {
  const windowStart = new Date(
    now.getTime() - CHAT_RATE_BURST_WINDOW_MS,
  ).toISOString();

  const { data, error } = await supabase
    .from(CHAT_MESSAGES_TABLE)
    .select("created_at")
    .eq("owner_session_id", sessionId)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false })
    .limit(CHAT_RATE_BURST_MAX);

  if (error) {
    // Fail closed on rate-check errors — avoid unbounded spam if DB is unhealthy.
    return { ok: false, error: "rate_limited" };
  }

  const rows = data ?? [];
  if (rows.length >= CHAT_RATE_BURST_MAX) {
    return { ok: false, error: "rate_limited" };
  }

  const latest = rows[0];
  if (latest && typeof latest.created_at === "string") {
    const latestMs = Date.parse(latest.created_at);
    if (
      Number.isFinite(latestMs) &&
      now.getTime() - latestMs < CHAT_RATE_MIN_INTERVAL_MS
    ) {
      return { ok: false, error: "rate_limited" };
    }
  }

  return { ok: true };
}

/**
 * Pure helper for tests — same policy as checkChatRateLimit without DB.
 */
export function evaluateChatRateLimit(
  recentCreatedAtIso: readonly string[],
  nowMs: number,
): ChatRateLimitDecision {
  const windowStart = nowMs - CHAT_RATE_BURST_WINDOW_MS;
  const inWindow = recentCreatedAtIso
    .map((iso) => Date.parse(iso))
    .filter((ms) => Number.isFinite(ms) && ms >= windowStart)
    .sort((a, b) => b - a);

  if (inWindow.length >= CHAT_RATE_BURST_MAX) {
    return { ok: false, error: "rate_limited" };
  }

  const latest = inWindow[0];
  if (latest !== undefined && nowMs - latest < CHAT_RATE_MIN_INTERVAL_MS) {
    return { ok: false, error: "rate_limited" };
  }

  return { ok: true };
}

export type CreateChatMessageResult =
  | { ok: true; message: ChatMessage; status: 201 }
  | {
      ok: false;
      error: string;
      status: number;
    };

export async function createChatMessage(
  supabase: PresenceSupabase,
  body: unknown,
  now: Date = new Date(),
): Promise<CreateChatMessageResult> {
  const parsed = parseCreateChatInput(body);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, status: 400 };
  }

  const rate = await checkChatRateLimit(supabase, parsed.sessionId, now);
  if (!rate.ok) {
    return { ok: false, error: rate.error, status: 429 };
  }

  const { data, error } = await supabase
    .from(CHAT_MESSAGES_TABLE)
    .insert({
      chain_id: CHAIN_ID,
      owner_session_id: parsed.sessionId,
      display_name: parsed.displayName,
      colour: parsed.colour,
      body: parsed.body,
      // Let DB default expires_at = now() + 24h when omitted would work,
      // but set explicitly so tests can assert the window.
      expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select(
      "id, chain_id, owner_session_id, display_name, colour, body, created_at, expires_at",
    )
    .single();

  if (error) {
    return { ok: false, error: "chat_unavailable", status: 500 };
  }

  const message = chatMessageFromRow(data);
  if (!message) {
    return { ok: false, error: "chat_unavailable", status: 500 };
  }

  return { ok: true, message, status: 201 };
}
