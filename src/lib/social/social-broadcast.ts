/**
 * Injectable Supabase Realtime Broadcast client for social draft events.
 */

import type { BrowserSupabase } from "@/lib/events/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  SOCIAL_BROADCAST_CHANNEL_NAME,
  TEXT_DRAFT_CLEARED_EVENT,
  TEXT_DRAFT_UPDATED_EVENT,
  type TextDraft,
  type TextDraftCleared,
} from "@/lib/social/text-draft";

export type SocialBroadcastStatus =
  | "SUBSCRIBED"
  | "CLOSED"
  | "CHANNEL_ERROR"
  | "TIMED_OUT"
  | string;

export type SocialBroadcastHandlers = {
  onDraftUpdated: (draft: unknown) => void;
  onDraftCleared: (cleared: unknown) => void;
  onStatus: (status: SocialBroadcastStatus) => void;
};

export type SocialBroadcastSubscription = {
  disconnect: () => void;
  sendDraftUpdated: (draft: TextDraft) => Promise<void>;
  sendDraftCleared: (cleared: TextDraftCleared) => Promise<void>;
};

export type SocialBroadcastClient = {
  connect: (handlers: SocialBroadcastHandlers) => SocialBroadcastSubscription;
};

export function createSocialBroadcastClient(
  supabase: BrowserSupabase,
): SocialBroadcastClient {
  return {
    connect(handlers) {
      const channel: RealtimeChannel = supabase.channel(
        SOCIAL_BROADCAST_CHANNEL_NAME,
        {
          config: {
            broadcast: { self: false },
          },
        },
      );

      channel
        .on(
          "broadcast",
          { event: TEXT_DRAFT_UPDATED_EVENT },
          ({ payload }) => {
            handlers.onDraftUpdated(payload);
          },
        )
        .on(
          "broadcast",
          { event: TEXT_DRAFT_CLEARED_EVENT },
          ({ payload }) => {
            handlers.onDraftCleared(payload);
          },
        )
        .subscribe((status) => {
          handlers.onStatus(status);
        });

      return {
        disconnect: () => {
          void supabase.removeChannel(channel);
        },
        sendDraftUpdated: async (draft) => {
          await channel.send({
            type: "broadcast",
            event: TEXT_DRAFT_UPDATED_EVENT,
            payload: draft,
          });
        },
        sendDraftCleared: async (cleared) => {
          await channel.send({
            type: "broadcast",
            event: TEXT_DRAFT_CLEARED_EVENT,
            payload: cleared,
          });
        },
      };
    },
  };
}
