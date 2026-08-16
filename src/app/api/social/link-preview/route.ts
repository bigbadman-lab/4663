/**
 * POST /api/social/link-preview — named-canvas LINK metadata snapshot.
 * Validates URL, SSRF-safe fetch, returns sanitized strings only.
 */

import { fetchLinkPreview } from "@/lib/social/link-preview-server";

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

  const url =
    body !== null && typeof body === "object" && "url" in body
      ? (body as { url: unknown }).url
      : undefined;

  const result = await fetchLinkPreview(url);
  if (!result.ok) {
    const status =
      result.error === "invalid_url" || result.error === "blocked"
        ? 400
        : result.error === "timeout" || result.error === "oversized"
          ? 422
          : result.error === "not_html"
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
