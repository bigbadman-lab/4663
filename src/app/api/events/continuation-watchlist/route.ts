/**
 * GET /api/events/continuation-watchlist
 * Up to 5 pons_buyer_continuation tokens from the current UTC day.
 */

import { loadContinuationWatchlist } from "@/lib/events/continuation-watchlist";
import { createPresenceSupabase } from "@/lib/presence/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function GET(): Promise<Response> {
  let supabase;
  try {
    supabase = createPresenceSupabase();
  } catch {
    return Response.json(
      { ok: false, error: "events_unavailable" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const result = await loadContinuationWatchlist(supabase, Date.now());
  if (!result.ok) {
    return Response.json(
      { ok: false, error: "events_unavailable" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return Response.json(result.body, {
    status: 200,
    headers: NO_STORE_HEADERS,
  });
}
