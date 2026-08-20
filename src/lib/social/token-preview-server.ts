/**
 * TOKEN preview orchestration — classify then chain-specific resolve.
 * Server-only. Robinhood via ALCHEMY_RPC_URL; Solana via SOLANA_RPC_URL.
 */

import { classifyTokenInput } from "@/lib/social/token-classify";
import type { ResolvedCanvasToken } from "@/lib/social/canvas-token";
import type { TokenPreviewErrorCode } from "@/lib/social/token-preview";
import {
  resolveRobinhoodToken,
  type ResolveRobinhoodTokenDeps,
  type ResolveRobinhoodTokenResult,
} from "@/lib/social/token-preview-robinhood";
import {
  resolveSolanaToken,
  type ResolveSolanaTokenDeps,
  type ResolveSolanaTokenResult,
} from "@/lib/social/token-preview-solana";

export type PreviewCanvasTokenResult =
  | { ok: true; preview: ResolvedCanvasToken }
  | { ok: false; error: TokenPreviewErrorCode };

export type PreviewCanvasTokenDeps = {
  resolveRobinhood?: (
    raw: unknown,
    deps?: ResolveRobinhoodTokenDeps,
  ) => Promise<ResolveRobinhoodTokenResult>;
  resolveSolana?: (
    raw: unknown,
    deps?: ResolveSolanaTokenDeps,
  ) => Promise<ResolveSolanaTokenResult>;
  robinhood?: ResolveRobinhoodTokenDeps;
  solana?: ResolveSolanaTokenDeps;
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
  if (classified.kind === "tx_hash" || classified.kind === "other") {
    return { ok: false, error: "invalid_address" };
  }
  if (classified.kind === "solana") {
    const resolve = deps.resolveSolana ?? resolveSolanaToken;
    return resolve(classified.address, deps.solana);
  }

  const resolve = deps.resolveRobinhood ?? resolveRobinhoodToken;
  return resolve(classified.address, deps.robinhood);
}
