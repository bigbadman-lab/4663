/**
 * Injectable Realtime INSERT subscription for public.canvas_pins.
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
  subscribeInserts: (handlers: {
    onInsert: (row: unknown) => void;
    onStatus: (status: PinsRealtimeStatus) => void;
  }) => PinsRealtimeSubscription;
};

export function createPinsRealtimeClient(
  supabase: BrowserSupabase,
): PinsRealtimeClient {
  return {
    subscribeInserts({ onInsert, onStatus }) {
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
