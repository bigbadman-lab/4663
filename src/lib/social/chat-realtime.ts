/**
 * Injectable Realtime INSERT subscription for public.chat_messages.
 */

import type { BrowserSupabase } from "@/lib/events/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  CHAT_MESSAGES_REALTIME_CHANNEL,
  CHAT_MESSAGES_TABLE,
} from "@/lib/social/chat-message";

export type ChatRealtimeStatus =
  | "SUBSCRIBED"
  | "CLOSED"
  | "CHANNEL_ERROR"
  | "TIMED_OUT"
  | string;

export type ChatRealtimeSubscription = {
  unsubscribe: () => void;
};

export type ChatRealtimeClient = {
  subscribeInserts: (handlers: {
    onInsert: (row: unknown) => void;
    onStatus: (status: ChatRealtimeStatus) => void;
  }) => ChatRealtimeSubscription;
};

export function createChatRealtimeClient(
  supabase: BrowserSupabase,
): ChatRealtimeClient {
  return {
    subscribeInserts({ onInsert, onStatus }) {
      const channel: RealtimeChannel = supabase
        .channel(CHAT_MESSAGES_REALTIME_CHANNEL)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: CHAT_MESSAGES_TABLE,
          },
          (payload) => {
            onInsert(payload.new);
          },
        )
        .subscribe((status) => {
          onStatus(status);
        });

      return {
        unsubscribe: () => {
          void supabase.removeChannel(channel);
        },
      };
    },
  };
}
