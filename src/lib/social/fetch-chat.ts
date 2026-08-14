/**
 * Browser fetch helpers for live chat API.
 */

import {
  CHAT_API_PATH,
  normalizeChatMessage,
  type ChatMessage,
} from "@/lib/social/chat-message";

export async function fetchRecentChatMessages(
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ChatMessage[]> {
  const res = await fetchFn(CHAT_API_PATH, {
    method: "GET",
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    throw new Error(`chat GET HTTP ${res.status}`);
  }

  const body: unknown = await res.json();
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !Array.isArray((body as { messages?: unknown }).messages)
  ) {
    throw new Error("chat GET malformed");
  }

  const messages: ChatMessage[] = [];
  for (const item of (body as { messages: unknown[] }).messages) {
    const message = normalizeChatMessage(item);
    if (message) messages.push(message);
  }
  return messages;
}

export type PostChatMessageInput = {
  sessionId: string;
  displayName: string;
  colour: string;
  body: string;
};

export type PostChatMessageResult =
  | { ok: true; message: ChatMessage }
  | { ok: false; error: string; status: number };

export async function postChatMessage(
  input: PostChatMessageInput,
  fetchFn: typeof fetch = fetch,
): Promise<PostChatMessageResult> {
  const res = await fetchFn(CHAT_API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, error: "invalid_response", status: res.status };
  }

  if (res.status === 201 || res.ok) {
    const message = normalizeChatMessage(
      payload !== null &&
        typeof payload === "object" &&
        !Array.isArray(payload)
        ? (payload as { message?: unknown }).message
        : null,
    );
    if (!message) {
      return { ok: false, error: "invalid_response", status: res.status };
    }
    return { ok: true, message };
  }

  const error =
    payload !== null &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    typeof (payload as { error?: unknown }).error === "string"
      ? (payload as { error: string }).error
      : "create_failed";

  return { ok: false, error, status: res.status };
}
