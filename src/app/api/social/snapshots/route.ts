/**
 * POST /api/social/snapshots — accept one SNAPSHOT PNG and store it.
 * Not a generic upload endpoint: PNG magic, size, chain, session only.
 */

import { createPresenceSupabase } from "@/lib/presence/supabase-server";
import { storeSnapshotPng } from "@/lib/social/snapshot-upload-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { ok: false, error: "invalid_form" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { ok: false, error: "missing_file" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  let supabase;
  try {
    supabase = createPresenceSupabase();
  } catch {
    return Response.json(
      { ok: false, error: "server_misconfigured" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const result = await storeSnapshotPng(supabase, {
    bytes,
    mimeType: file.type || form.get("contentType")?.toString() || null,
    chainId: form.get("chainId"),
    sessionId: form.get("sessionId"),
  });

  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error },
      { status: result.status, headers: NO_STORE_HEADERS },
    );
  }

  return Response.json(
    {
      ok: true,
      imageUrl: result.imageUrl,
      width: result.width,
      height: result.height,
    },
    { status: 201, headers: NO_STORE_HEADERS },
  );
}
