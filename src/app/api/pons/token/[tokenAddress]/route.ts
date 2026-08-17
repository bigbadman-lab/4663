/**
 * GET /api/pons/token/[tokenAddress]
 * On-demand RADAR investigation detail from stored data (no chain RPC).
 *
 * Route name is PONS-historical (kept this phase to avoid a broad rename).
 * Pass `?launchpad=pons|pools` so a POOLS token is not looked up as PONS.
 * Future RADAR module should call `loadRadarTokenDetail`, not this path.
 */

import { loadRadarTokenDetail } from "@/lib/events/radar-token-detail";
import { parseLaunchpad } from "@/lib/radar/launchpad";
import { createPresenceSupabase } from "@/lib/presence/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

type RouteContext = {
  params: Promise<{ tokenAddress: string }>;
};

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { tokenAddress } = await context.params;
  const launchpad = parseLaunchpad(
    new URL(request.url).searchParams.get("launchpad"),
  );

  let supabase;
  try {
    supabase = createPresenceSupabase();
  } catch {
    return Response.json(
      { ok: false, error: "unavailable" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const result = await loadRadarTokenDetail(supabase, tokenAddress, {
    launchpad,
  });
  if (!result.ok) {
    const status =
      result.error === "invalid_token"
        ? 400
        : result.error === "not_found"
          ? 404
          : 500;
    return Response.json(
      { ok: false, error: result.error },
      { status, headers: NO_STORE_HEADERS },
    );
  }

  return Response.json(result.body, {
    status: 200,
    headers: NO_STORE_HEADERS,
  });
}
