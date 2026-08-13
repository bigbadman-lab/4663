/**
 * GET /api/token/official
 * Public read of the official 4663 token contract (LAUNCH1).
 * Read-only. Never activates.
 */

import { createPresenceSupabase } from "@/lib/presence/supabase-server";
import { loadOfficialTokenPublicState } from "@/lib/token/official-store";

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
      { active: false, error: "token_unavailable" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const result = await loadOfficialTokenPublicState(supabase);
  if (!result.ok) {
    return Response.json(
      { active: false, error: "token_unavailable" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  if (!result.state.active) {
    return Response.json(
      { active: false },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  }

  return Response.json(
    {
      active: true,
      chainId: result.state.chainId,
      contractAddress: result.state.contractAddress,
    },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}
