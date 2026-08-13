/**
 * Injectable Realtime INSERT + DELETE subscription for public.canvas_pins.
 */

import type { BrowserSupabase } from "@/lib/events/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  CANVAS_PINS_REALTIME_CHANNEL,
  CANVAS_PINS_TABLE,
} from "@/lib/social/canvas-pin";

export type PinsRealtimeStatus =
  | "SUBSCRIBED"
  | "CLOSED"
  | "CHANNEL_ERROR"
  | "TIMED_OUT"
  | string;

export type PinsRealtimeSubscription = {
  unsubscribe: () => void;
};

export type PinsRealtimeClient = {
  subscribeChanges: (handlers: {
    onInsert: (row: unknown) => void;
    onDelete: (row: unknown) => void;
    onStatus: (status: PinsRealtimeStatus) => void;
  }) => PinsRealtimeSubscription;
};

export function createPinsRealtimeClient(
  supabase: BrowserSupabase,
): PinsRealtimeClient {
  return {
    subscribeChanges({ onInsert, onDelete, onStatus }) {
      const channel: RealtimeChannel = supabase
        .channel(CANVAS_PINS_REALTIME_CHANNEL)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: CANVAS_PINS_TABLE,
          },
          (payload) => {
            onInsert(payload.new);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: CANVAS_PINS_TABLE,
          },
          (payload) => {
            onDelete(payload.old);
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
