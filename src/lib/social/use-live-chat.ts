"use client";

/**
 * Live chat React hook — history + Realtime + send.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/events/supabase-browser";
import type { ChatMessage } from "@/lib/social/chat-message";
import { createChatRealtimeClient } from "@/lib/social/chat-realtime";
import {
  fetchRecentChatMessages,
  postChatMessage,
} from "@/lib/social/fetch-chat";
import {
  LiveChatStreamController,
  type LiveChatStreamStatus,
} from "@/lib/social/live-chat-stream";

export type UseLiveChatResult = {
  messages: readonly ChatMessage[];
  status: LiveChatStreamStatus;
  sending: boolean;
  sendError: string | null;
  send: (input: {
    sessionId: string;
    displayName: string;
    colour: string;
    body: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  clearSendError: () => void;
};

export function useLiveChat(): UseLiveChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<LiveChatStreamStatus>("connecting");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const controllerRef = useRef<LiveChatStreamController | null>(null);

  useEffect(() => {
    let controller: LiveChatStreamController | null = null;

    try {
      const supabase = getBrowserSupabaseClient();
      controller = new LiveChatStreamController({
        realtime: createChatRealtimeClient(supabase),
        fetchRecent: (signal) => fetchRecentChatMessages(fetch, signal),
        onMessages: setMessages,
        onStatus: setStatus,
        onError: () => {
          // Quiet — status / retry handle UX.
        },
        setTimeoutFn: (handler, ms) => window.setTimeout(handler, ms),
        clearTimeoutFn: (id) => window.clearTimeout(id as number),
      });
      controllerRef.current = controller;
      controller.start();
    } catch {
      queueMicrotask(() => setStatus("error"));
    }

    return () => {
      controller?.stop();
      controllerRef.current = null;
    };
  }, []);

  const clearSendError = useCallback(() => setSendError(null), []);

  const send = useCallback(
    async (input: {
      sessionId: string;
      displayName: string;
      colour: string;
      body: string;
    }) => {
      setSending(true);
      setSendError(null);
      try {
        const result = await postChatMessage(input);
        if (!result.ok) {
          const message =
            result.status === 429
              ? "Slow down."
              : result.error === "invalid_body_text"
                ? "Message is required."
                : "Could not send.";
          setSendError(message);
          return { ok: false as const, error: message };
        }
        controllerRef.current?.applyLocalMessage(result.message);
        return { ok: true as const };
      } catch {
        const message = "Could not send.";
        setSendError(message);
        return { ok: false as const, error: message };
      } finally {
        setSending(false);
      }
    },
    [],
  );

  return {
    messages,
    status,
    sending,
    sendError,
    send,
    clearSendError,
  };
}
