/**
 * Injectable Supabase Realtime Broadcast client for social draft events.
 * Shared channel: text drafts (2B) + drawing drafts (3A) + brush drafts (3B).
 */

import type { BrowserSupabase } from "@/lib/events/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  BRUSH_DRAFT_CLEARED_EVENT,
  BRUSH_DRAFT_UPDATED_EVENT,
  type BrushDraft,
  type BrushDraftCleared,
} from "@/lib/social/brush-draft";
import {
  DRAWING_DRAFT_CLEARED_EVENT,
  DRAWING_DRAFT_UPDATED_EVENT,
  SOCIAL_BROADCAST_CHANNEL_NAME,
  type DrawingDraft,
  type DrawingDraftCleared,
} from "@/lib/social/drawing-draft";
import {
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
  onDrawingDraftUpdated?: (draft: unknown) => void;
  onDrawingDraftCleared?: (cleared: unknown) => void;
  onBrushDraftUpdated?: (draft: unknown) => void;
  onBrushDraftCleared?: (cleared: unknown) => void;
  onStatus: (status: SocialBroadcastStatus) => void;
};

export type SocialBroadcastSubscription = {
  disconnect: () => void;
  sendDraftUpdated: (draft: TextDraft) => Promise<void>;
  sendDraftCleared: (cleared: TextDraftCleared) => Promise<void>;
  sendDrawingDraftUpdated: (draft: DrawingDraft) => Promise<void>;
  sendDrawingDraftCleared: (cleared: DrawingDraftCleared) => Promise<void>;
  sendBrushDraftUpdated: (draft: BrushDraft) => Promise<void>;
  sendBrushDraftCleared: (cleared: BrushDraftCleared) => Promise<void>;
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
        .on(
          "broadcast",
          { event: DRAWING_DRAFT_UPDATED_EVENT },
          ({ payload }) => {
            handlers.onDrawingDraftUpdated?.(payload);
          },
        )
        .on(
          "broadcast",
          { event: DRAWING_DRAFT_CLEARED_EVENT },
          ({ payload }) => {
            handlers.onDrawingDraftCleared?.(payload);
          },
        )
        .on(
          "broadcast",
          { event: BRUSH_DRAFT_UPDATED_EVENT },
          ({ payload }) => {
            handlers.onBrushDraftUpdated?.(payload);
          },
        )
        .on(
          "broadcast",
          { event: BRUSH_DRAFT_CLEARED_EVENT },
          ({ payload }) => {
            handlers.onBrushDraftCleared?.(payload);
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
        sendDrawingDraftUpdated: async (draft) => {
          await channel.send({
            type: "broadcast",
            event: DRAWING_DRAFT_UPDATED_EVENT,
            payload: draft,
          });
        },
        sendDrawingDraftCleared: async (cleared) => {
          await channel.send({
            type: "broadcast",
            event: DRAWING_DRAFT_CLEARED_EVENT,
            payload: cleared,
          });
        },
        sendBrushDraftUpdated: async (draft) => {
          await channel.send({
            type: "broadcast",
            event: BRUSH_DRAFT_UPDATED_EVENT,
            payload: draft,
          });
        },
        sendBrushDraftCleared: async (cleared) => {
          await channel.send({
            type: "broadcast",
            event: BRUSH_DRAFT_CLEARED_EVENT,
            payload: cleared,
          });
        },
      };
    },
  };
}
