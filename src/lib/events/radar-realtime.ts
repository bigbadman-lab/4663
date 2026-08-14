/**
 * Dedicated Realtime wake for pons_buyer_continuation (RADAR only).
 * Not merged into the public buying-activity canvas stream.
 */

import type { BrowserSupabase } from "@/lib/events/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { EVENT_TYPE_PONS_BUYER_CONTINUATION } from "@/lib/pons/constants";

export const RADAR_CONTINUATION_CHANNEL_NAME =
  "4663-radar-continuation" as const;

export type RadarContinuationRealtimeStatus =
  | "SUBSCRIBED"
  | "CLOSED"
  | "CHANNEL_ERROR"
  | "TIMED_OUT"
  | string;

export type RadarContinuationWake = {
  eventId: string;
  tokenAddress: string;
  occurredAt: string | null;
};

export type RadarContinuationRealtimeSubscription = {
  unsubscribe: () => void;
};

export type RadarContinuationRealtimeClient = {
  subscribeInserts: (handlers: {
    onInsert: (wake: RadarContinuationWake) => void;
    onStatus: (status: RadarContinuationRealtimeStatus) => void;
  }) => RadarContinuationRealtimeSubscription;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADDRESS_RE = /^0x[0-9a-f]{40}$/;

/** Minimal safe wake payload from a Realtime INSERT row. */
export function normalizeRadarContinuationWake(
  row: unknown,
): RadarContinuationWake | null {
  if (row === null || row === undefined) return null;
  if (typeof row !== "object" || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  if (r.event_type !== EVENT_TYPE_PONS_BUYER_CONTINUATION) return null;
  if (typeof r.id !== "string" || !UUID_RE.test(r.id.trim())) return null;
  if (typeof r.token_address !== "string") return null;
  const tokenAddress = r.token_address.trim().toLowerCase();
  if (!ADDRESS_RE.test(tokenAddress)) return null;
  let occurredAt: string | null = null;
  if (typeof r.occurred_at === "string" && r.occurred_at.trim() !== "") {
    const ms = Date.parse(r.occurred_at);
    if (!Number.isNaN(ms)) occurredAt = new Date(ms).toISOString();
  }
  return {
    eventId: r.id.trim().toLowerCase(),
    tokenAddress,
    occurredAt,
  };
}

export function createRadarContinuationRealtimeClient(
  supabase: BrowserSupabase,
): RadarContinuationRealtimeClient {
  return {
    subscribeInserts({ onInsert, onStatus }) {
      const channel: RealtimeChannel = supabase
        .channel(RADAR_CONTINUATION_CHANNEL_NAME)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "events",
            filter: `event_type=eq.${EVENT_TYPE_PONS_BUYER_CONTINUATION}`,
          },
          (payload) => {
            const wake = normalizeRadarContinuationWake(payload.new);
            if (!wake) return;
            onInsert(wake);
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
