/**
 * GET /api/social/chat — latest non-expired chat messages (max 50, oldest→newest).
 * POST /api/social/chat — create a message (named participation claim + rate limit).
 */

import { createPresenceSupabase } from "@/lib/presence/supabase-server";
import {
  createChatMessage,
  loadRecentChatMessages,
} from "@/lib/social/chat-server";

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
      { ok: false, error: "chat_unavailable" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const result = await loadRecentChatMessages(supabase);
  if (!result.ok) {
    return Response.json(
      { ok: false, error: "chat_unavailable" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return Response.json(
    { ok: true, messages: result.messages },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}

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

  const result = await createChatMessage(supabase, body);
  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }

  return Response.json(
    { ok: true, message: result.message },
    { status: 201 },
  );
}
