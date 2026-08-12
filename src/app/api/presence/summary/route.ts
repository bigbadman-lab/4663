/**
 * GET /api/presence/summary
 * Public aggregate presence facts only (no raw sessions).
 */

import { createPresenceSupabase } from "@/lib/presence/supabase-server";
import {
  EMPTY_PRESENCE_SUMMARY,
  loadPresenceSummary,
} from "@/lib/presence/summary";

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
      { ok: false, error: "summary_unavailable" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const result = await loadPresenceSummary(supabase);
  if (!result.ok) {
    return Response.json(
      { ok: false, error: "summary_unavailable" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return Response.json(result.summary ?? EMPTY_PRESENCE_SUMMARY, {
    status: 200,
    headers: NO_STORE_HEADERS,
  });
}
