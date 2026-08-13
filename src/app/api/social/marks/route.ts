/**
 * GET /api/social/marks — active (non-expired) canvas marks.
 * POST /api/social/marks — create one mark per participation session.
 */

import { createPresenceSupabase } from "@/lib/presence/supabase-server";
import {
  createCanvasMark,
  loadActiveCanvasMarks,
} from "@/lib/social/marks-server";

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
      { ok: false, error: "marks_unavailable" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const result = await loadActiveCanvasMarks(supabase);
  if (!result.ok) {
    return Response.json(
      { ok: false, error: "marks_unavailable" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return Response.json(
    { ok: true, marks: result.marks },
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

  const result = await createCanvasMark(supabase, body);
  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }

  return Response.json(
    { ok: true, mark: result.mark },
    { status: 201 },
  );
}
