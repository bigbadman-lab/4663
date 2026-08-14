/**
 * Global live chat — validation + normalize (not canvas TEXT/MARK).
 */

import { CHAIN_ID } from "@/lib/pons/constants";
import {
  isUuid,
  normalizeSessionId,
} from "@/lib/presence/session-id";
import {
  colourFromSessionId,
  isParticipationColour,
  type ParticipationColour,
} from "@/lib/social/colour";
import { validateDisplayName } from "@/lib/social/display-name";

export const CHAT_MESSAGE_MAX_LENGTH = 200 as const;
export const CHAT_MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;
export const CHAT_MESSAGES_GET_LIMIT = 50 as const;
export const CHAT_API_PATH = "/api/social/chat" as const;
export const CHAT_MESSAGES_TABLE = "chat_messages" as const;
export const CHAT_MESSAGES_REALTIME_CHANNEL = "4663-live-chat" as const;

/** Min gap between accepted messages per participation session. */
export const CHAT_RATE_MIN_INTERVAL_MS = 2_000 as const;
/** Burst window for accepted messages per participation session. */
export const CHAT_RATE_BURST_WINDOW_MS = 15_000 as const;
export const CHAT_RATE_BURST_MAX = 5 as const;

export type ChatMessage = {
  id: string;
  ownerSessionId: string;
  displayName: string;
  colour: ParticipationColour;
  body: string;
  createdAt: string;
};

export type ValidateChatBodyResult =
  | { ok: true; body: string }
  | { ok: false; error: string };

export function validateChatBody(raw: unknown): ValidateChatBodyResult {
  if (typeof raw !== "string") {
    return { ok: false, error: "Message is required." };
  }
  const body = raw.trim();
  if (body.length === 0) {
    return { ok: false, error: "Message is required." };
  }
  if (body.length > CHAT_MESSAGE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Message must be ${CHAT_MESSAGE_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true, body };
}

export function chatExpiresAtFromCreated(createdAt: Date): Date {
  return new Date(createdAt.getTime() + CHAT_MESSAGE_TTL_MS);
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    Number.isFinite(Date.parse(value))
  );
}

/** Normalize a client/API chat DTO (camelCase). Public fields only. */
export function normalizeChatMessage(raw: unknown): ChatMessage | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;

  if (!isUuid(record.id)) return null;
  if (!isUuid(record.ownerSessionId)) return null;

  const nameResult = validateDisplayName(record.displayName);
  if (!nameResult.ok) return null;
  if (!isParticipationColour(record.colour)) return null;

  const bodyResult = validateChatBody(record.body);
  if (!bodyResult.ok) return null;

  if (!isIsoTimestamp(record.createdAt)) return null;

  return {
    id: normalizeSessionId(record.id),
    ownerSessionId: normalizeSessionId(record.ownerSessionId),
    displayName: nameResult.name,
    colour: record.colour,
    body: bodyResult.body,
    createdAt: record.createdAt,
  };
}

/** Map a postgres row (snake_case) to public ChatMessage. */
export function chatMessageFromRow(raw: unknown): ChatMessage | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const row = raw as Record<string, unknown>;
  return normalizeChatMessage({
    id: row.id,
    ownerSessionId: row.owner_session_id,
    displayName: row.display_name,
    colour: row.colour,
    body: row.body,
    createdAt: row.created_at,
  });
}

export function mergeChatMessages(
  existing: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
  limit: number = CHAT_MESSAGES_GET_LIMIT,
): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of existing) byId.set(m.id, m);
  for (const m of incoming) {
    // First-wins: ignore duplicate INSERT echoes / refetch overlaps.
    if (!byId.has(m.id)) byId.set(m.id, m);
  }
  const next = [...byId.values()].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  if (next.length <= limit) return next;
  return next.slice(next.length - limit);
}

export function upsertChatMessage(
  messages: readonly ChatMessage[],
  message: ChatMessage,
  limit: number = CHAT_MESSAGES_GET_LIMIT,
): ChatMessage[] {
  return mergeChatMessages(messages, [message], limit);
}

export type CreateChatInput = {
  sessionId: unknown;
  displayName: unknown;
  colour: unknown;
  body: unknown;
};

export type ParsedCreateChat =
  | {
      ok: true;
      sessionId: string;
      displayName: string;
      colour: ParticipationColour;
      body: string;
    }
  | { ok: false; error: string };

export function parseCreateChatInput(body: unknown): ParsedCreateChat {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const record = body as Record<string, unknown>;

  if (!isUuid(record.sessionId)) {
    return { ok: false, error: "invalid_session" };
  }
  const sessionId = normalizeSessionId(record.sessionId);

  const nameResult = validateDisplayName(record.displayName);
  if (!nameResult.ok) {
    return { ok: false, error: "invalid_display_name" };
  }

  if (!isParticipationColour(record.colour)) {
    return { ok: false, error: "invalid_colour" };
  }
  if (record.colour !== colourFromSessionId(sessionId)) {
    return { ok: false, error: "invalid_colour" };
  }

  const bodyResult = validateChatBody(record.body);
  if (!bodyResult.ok) {
    return { ok: false, error: "invalid_body_text" };
  }

  return {
    ok: true,
    sessionId,
    displayName: nameResult.name,
    colour: record.colour,
    body: bodyResult.body,
  };
}

export { CHAIN_ID };
