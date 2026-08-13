/**
 * GET /api/events/summon-history
 * Verified historical pons_buyer_continuation events for Summon (Stage 8A.7).
 */

import {
  loadSummonHistoryEvents,
  parseSummonHistoryLimit,
} from "@/lib/events/summon-history";
import { createPresenceSupabase } from "@/lib/presence/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const limit = parseSummonHistoryLimit(url.searchParams.get("limit"));

  let supabase;
  try {
    supabase = createPresenceSupabase();
  } catch {
    return Response.json(
      { ok: false, error: "events_unavailable" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const result = await loadSummonHistoryEvents(supabase, limit);
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
