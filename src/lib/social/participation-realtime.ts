/**
 * Injectable Supabase Realtime Presence client for named participation.
 */

import type { BrowserSupabase } from "@/lib/events/supabase-browser";
import type { ParticipationPresencePayload } from "@/lib/social/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

export const PARTICIPATION_CHANNEL_NAME = "4663-participation" as const;

export type ParticipationRealtimeStatus =
  | "SUBSCRIBED"
  | "CLOSED"
  | "CHANNEL_ERROR"
  | "TIMED_OUT"
  | string;

export type ParticipationPresenceSubscription = {
  /** Stop listening and remove the channel. */
  disconnect: () => void;
  /** Re-assert local track (e.g. after reconnect SUBSCRIBED). */
  track: (payload: ParticipationPresencePayload) => Promise<void>;
  untrack: () => Promise<void>;
  getPresenceState: () => Record<string, unknown[] | undefined>;
};

export type ParticipationPresenceHandlers = {
  onSync: (state: Record<string, unknown[] | undefined>) => void;
  onStatus: (status: ParticipationRealtimeStatus) => void;
};

export type ParticipationPresenceClient = {
  connect: (opts: {
    /** Presence key — participation session id. */
    presenceKey: string;
    handlers: ParticipationPresenceHandlers;
  }) => ParticipationPresenceSubscription;
};

/**
 * Presence helpers exist on RealtimeChannel at runtime; typings in some
 * @supabase versions omit them from the public .d.ts surface.
 */
type PresenceCapableChannel = RealtimeChannel & {
  track: (
    payload: ParticipationPresencePayload,
  ) => Promise<"ok" | "timed out" | "error" | string>;
  untrack: () => Promise<"ok" | "timed out" | "error" | string>;
  presenceState: () => Record<string, unknown[] | undefined>;
};

export function createParticipationPresenceClient(
  supabase: BrowserSupabase,
): ParticipationPresenceClient {
  return {
    connect({ presenceKey, handlers }) {
      const channel = supabase.channel(PARTICIPATION_CHANNEL_NAME, {
        config: {
          presence: { key: presenceKey },
        },
      }) as PresenceCapableChannel;

      channel
        .on("presence", { event: "sync" }, () => {
          handlers.onSync(channel.presenceState());
        })
        .on("presence", { event: "join" }, () => {
          handlers.onSync(channel.presenceState());
        })
        .on("presence", { event: "leave" }, () => {
          handlers.onSync(channel.presenceState());
        })
        .subscribe((status) => {
          handlers.onStatus(status);
        });

      return {
        disconnect: () => {
          void supabase.removeChannel(channel);
        },
        track: async (payload) => {
          await channel.track(payload);
        },
        untrack: async () => {
          await channel.untrack();
        },
        getPresenceState: () => channel.presenceState(),
      };
    },
  };
}
