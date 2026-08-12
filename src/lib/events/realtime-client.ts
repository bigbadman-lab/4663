/**
 * Injectable Realtime INSERT subscription for public.events.
 */

import type { BrowserSupabase } from "@/lib/events/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";

export const PUBLIC_EVENTS_CHANNEL_NAME = "4663-public-events" as const;

export type EventsRealtimeStatus =
  | "SUBSCRIBED"
  | "CLOSED"
  | "CHANNEL_ERROR"
  | "TIMED_OUT"
  | string;

export type EventsRealtimeSubscription = {
  unsubscribe: () => void;
};

export type EventsRealtimeClient = {
  subscribeInserts: (handlers: {
    onInsert: (row: unknown) => void;
    onStatus: (status: EventsRealtimeStatus) => void;
  }) => EventsRealtimeSubscription;
};

export function createEventsRealtimeClient(
  supabase: BrowserSupabase,
): EventsRealtimeClient {
  return {
    subscribeInserts({ onInsert, onStatus }) {
      const channel: RealtimeChannel = supabase
        .channel(PUBLIC_EVENTS_CHANNEL_NAME)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "events",
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
