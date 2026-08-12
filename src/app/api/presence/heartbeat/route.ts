/**
 * POST /api/presence/heartbeat
 * Anonymous presence write path — service-role upsert only.
 */

import { processPresenceHeartbeat } from "@/lib/presence/process-heartbeat";
import { createPresenceSupabase } from "@/lib/presence/supabase-server";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  let supabase;
  try {
    supabase = createPresenceSupabase();
  } catch {
    return Response.json(
      { ok: false, error: "server_misconfigured" },
      { status: 500 },
    );
  }

  const result = await processPresenceHeartbeat({
    body,
    headers: request.headers,
    supabase,
  });

  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }

  return Response.json({ ok: true });
}
