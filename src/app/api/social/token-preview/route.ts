/**
 * POST /api/social/token-preview — named-canvas TOKEN metadata snapshot.
 * Server-only RPC. Never returns RPC URLs.
 */

import { previewCanvasToken } from "@/lib/social/token-preview-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "invalid_json" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const raw =
    body !== null && typeof body === "object" && "raw" in body
      ? (body as { raw: unknown }).raw
      : undefined;

  const result = await previewCanvasToken(raw);
  if (!result.ok) {
    const status =
      result.error === "invalid_json" ||
      result.error === "invalid_input" ||
      result.error === "invalid_address" ||
      result.error === "url" ||
      result.error === "solana_not_enabled"
        ? 400
        : result.error === "not_a_contract"
          ? 422
          : result.error === "timeout"
            ? 422
            : 502;
    return Response.json(
      { ok: false, error: result.error },
      { status, headers: NO_STORE_HEADERS },
    );
  }

  return Response.json(
    { ok: true, preview: result.preview },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}
