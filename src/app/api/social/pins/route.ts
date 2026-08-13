/**
 * GET /api/social/pins — active (non-expired) canvas pins.
 * POST /api/social/pins — pin a currently LIVE PONS event (one global pin / event).
 * DELETE /api/social/pins — owner UNPIN (session must match pinned_by_session_id).
 */

import { createPresenceSupabase } from "@/lib/presence/supabase-server";
import {
  createCanvasPin,
  deleteCanvasPin,
  loadActiveCanvasPins,
} from "@/lib/social/pins-server";

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
      { ok: false, error: "pins_unavailable" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const result = await loadActiveCanvasPins(supabase);
  if (!result.ok) {
    return Response.json(
      { ok: false, error: "pins_unavailable" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return Response.json(
    { ok: true, pins: result.pins },
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

  const result = await createCanvasPin(supabase, body);
  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }

  return Response.json(
    { ok: true, pin: result.pin },
    { status: 201 },
  );
}

export async function DELETE(request: Request): Promise<Response> {
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

  const result = await deleteCanvasPin(supabase, body);
  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }

  return Response.json(
    { ok: true, alreadyGone: result.alreadyGone === true },
    { status: 200 },
  );
}
