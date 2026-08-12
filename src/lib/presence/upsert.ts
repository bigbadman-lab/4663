/**
 * Durable presence upsert (service-role only).
 */

import type { CoarseGeo } from "@/lib/presence/geo";
import type { PresenceSupabase } from "@/lib/presence/supabase-server";

export type UpsertPresenceInput = {
  sessionId: string;
  geo: CoarseGeo;
  /** ISO timestamptz for last_seen_at (and insert default first_seen_at via DB). */
  seenAtIso: string;
};

/**
 * Upsert presence by session_id.
 * Omits first_seen_at so INSERT uses DB DEFAULT now() and UPDATE leaves it unchanged.
 */
export async function upsertPresenceHeartbeat(
  supabase: PresenceSupabase,
  input: UpsertPresenceInput,
): Promise<void> {
  const { error } = await supabase.from("presence").upsert(
    {
      session_id: input.sessionId,
      city: input.geo.city,
      country_code: input.geo.countryCode,
      last_seen_at: input.seenAtIso,
    },
    { onConflict: "session_id" },
  );

  if (error) {
    throw new Error(
      `[4663-presence] upsert presence failed: ${error.message}`,
    );
  }
}
