/**
 * Injectable Realtime INSERT subscription for public.canvas_marks.
 */

import type { BrowserSupabase } from "@/lib/events/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  CANVAS_MARKS_REALTIME_CHANNEL,
  CANVAS_MARKS_TABLE,
} from "@/lib/social/canvas-mark";

export type MarksRealtimeStatus =
  | "SUBSCRIBED"
  | "CLOSED"
  | "CHANNEL_ERROR"
  | "TIMED_OUT"
  | string;

export type MarksRealtimeSubscription = {
  unsubscribe: () => void;
};

export type MarksRealtimeClient = {
  subscribeInserts: (handlers: {
    onInsert: (row: unknown) => void;
    onStatus: (status: MarksRealtimeStatus) => void;
  }) => MarksRealtimeSubscription;
};

export function createMarksRealtimeClient(
  supabase: BrowserSupabase,
): MarksRealtimeClient {
  return {
    subscribeInserts({ onInsert, onStatus }) {
      const channel: RealtimeChannel = supabase
        .channel(CANVAS_MARKS_REALTIME_CHANNEL)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: CANVAS_MARKS_TABLE,
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
