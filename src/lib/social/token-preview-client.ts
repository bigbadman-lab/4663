/**
 * Browser helper for TOKEN metadata. Never talks to chain RPC itself.
 */

import {
  normalizeResolvedCanvasToken,
  type ResolvedCanvasToken,
} from "@/lib/social/canvas-token";
import { classifyTokenInput } from "@/lib/social/token-classify";
import {
  TOKEN_PREVIEW_API_PATH,
  tokenPreviewErrorMessage,
  type TokenPreviewClientError,
} from "@/lib/social/token-preview";

export type FetchTokenPreviewClientResult =
  | { ok: true; preview: ResolvedCanvasToken }
  | { ok: false; error: TokenPreviewClientError };

export async function requestTokenPreview(
  raw: string,
): Promise<FetchTokenPreviewClientResult> {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, error: "invalid_input" };
  }
  const classified = classifyTokenInput(raw);
  if (classified.kind === "other") {
    return { ok: false, error: "invalid_address" };
  }
  if (classified.kind === "tx_hash") {
    return { ok: false, error: "invalid_address" };
  }
  if (classified.kind === "url") {
    return { ok: false, error: "url" };
  }

  try {
    const response = await fetch(TOKEN_PREVIEW_API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { ok: false, error: "unavailable" };
    }
    if (!response.ok) {
      return { ok: false, error: clientErrorFromPayload(payload) };
    }
    if (
      payload === null ||
      typeof payload !== "object" ||
      !("preview" in payload)
    ) {
      return { ok: false, error: "unavailable" };
    }
    const preview = normalizeResolvedCanvasToken(
      (payload as { preview: unknown }).preview,
    );
    if (!preview) return { ok: false, error: "unavailable" };
    return { ok: true, preview };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

export { tokenPreviewErrorMessage };

function clientErrorFromPayload(payload: unknown): TokenPreviewClientError {
  if (
    payload !== null &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof (payload as { error: unknown }).error === "string"
  ) {
    const code = (payload as { error: string }).error;
    if (
      code === "invalid_json" ||
      code === "invalid_input" ||
      code === "invalid_address" ||
      code === "not_a_contract" ||
      code === "solana_not_enabled" ||
      code === "url" ||
      code === "timeout" ||
      code === "unavailable"
    ) {
      return code;
    }
  }
  return "unavailable";
}
