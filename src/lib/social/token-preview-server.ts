/**
 * TOKEN preview orchestration — classify then chain-specific resolve.
 * Server-only. Solana RPC is not implemented in this phase.
 */

import { classifyTokenInput } from "@/lib/social/token-classify";
import type { ResolvedCanvasToken } from "@/lib/social/canvas-token";
import type { TokenPreviewErrorCode } from "@/lib/social/token-preview";
import {
  resolveRobinhoodToken,
  type ResolveRobinhoodTokenDeps,
  type ResolveRobinhoodTokenResult,
} from "@/lib/social/token-preview-robinhood";

export type PreviewCanvasTokenResult =
  | { ok: true; preview: ResolvedCanvasToken }
  | { ok: false; error: TokenPreviewErrorCode };

export type PreviewCanvasTokenDeps = {
  resolveRobinhood?: (
    raw: unknown,
    deps?: ResolveRobinhoodTokenDeps,
  ) => Promise<ResolveRobinhoodTokenResult>;
  robinhood?: ResolveRobinhoodTokenDeps;
};

export async function previewCanvasToken(
  raw: unknown,
  deps: PreviewCanvasTokenDeps = {},
): Promise<PreviewCanvasTokenResult> {
  if (typeof raw !== "string") {
    return { ok: false, error: "invalid_input" };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "invalid_input" };
  }

  const classified = classifyTokenInput(trimmed);
  if (classified.kind === "url") {
    return { ok: false, error: "url" };
  }
  if (classified.kind === "solana") {
    return { ok: false, error: "solana_not_enabled" };
  }
  if (classified.kind === "tx_hash" || classified.kind === "other") {
    return { ok: false, error: "invalid_address" };
  }

  const resolve = deps.resolveRobinhood ?? resolveRobinhoodToken;
  return resolve(classified.address, deps.robinhood);
}
