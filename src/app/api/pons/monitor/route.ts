/**
 * GET /api/pons/monitor
 * Compact read-only snapshot of launches currently under PONS watch.
 * Health 2: short in-process TTL cache + in-flight coalescing.
 */

import { getCachedPonsMonitor } from "@/lib/pons/monitor-cache";
import { loadPonsMonitor } from "@/lib/pons/monitor";
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
      { ok: false, error: "monitor_unavailable" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const result = await getCachedPonsMonitor(() =>
    loadPonsMonitor(supabase, Date.now()),
  );
  if (!result.ok) {
    return Response.json(
      { ok: false, error: "monitor_unavailable" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return Response.json(result.body, {
    status: 200,
    headers: NO_STORE_HEADERS,
  });
}
