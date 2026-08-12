/**
 * GET /api/events/recent
 * Small normalized window of public production events (initial + reconnect recovery).
 */

import { loadRecentPublicEvents, parseRecentEventsLimit } from "@/lib/events/recent";
import { createPresenceSupabase } from "@/lib/presence/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const limit = parseRecentEventsLimit(url.searchParams.get("limit"));

  let supabase;
  try {
    supabase = createPresenceSupabase();
  } catch {
    return Response.json(
      { ok: false, error: "events_unavailable" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const result = await loadRecentPublicEvents(supabase, limit);
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
