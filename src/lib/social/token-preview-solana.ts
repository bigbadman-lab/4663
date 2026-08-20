/**
 * Server-only Solana TOKEN resolver (SPL + Token-2022 mints).
 * Uses SOLANA_RPC_URL (e.g. Helius). Never returns RPC URLs in snapshots.
 */

import { classifyTokenInput } from "@/lib/social/token-classify";
import {
  normalizeResolvedCanvasToken,
  type ResolvedCanvasToken,
} from "@/lib/social/canvas-token";

export const SOLANA_TOKEN_SOURCE_LABEL = "SOLANA" as const;
export const SOLANA_TOKEN_RESOLVE_TIMEOUT_MS = 8_000 as const;
export const SOLANA_TOKEN_METADATA_TIMEOUT_MS = 4_000 as const;

/** Classic SPL Token program. */
export const SOLANA_TOKEN_PROGRAM_ID =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as const;

/** Token-2022 program. */
export const SOLANA_TOKEN_2022_PROGRAM_ID =
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" as const;

/** Minimum mint account size (legacy layout before extensions). */
export const SOLANA_MINT_ACCOUNT_MIN_SIZE = 82 as const;

const MINT_DECIMALS_OFFSET = 44 as const;
const MINT_INITIALIZED_OFFSET = 45 as const;

export type SolanaMintAccountInfo = {
  owner: string;
  dataBase64: string;
  lamports: number;
};

export type SolanaTokenMetadata = {
  name: string | null;
  symbol: string | null;
  imageUrl: string | null;
};

export type SolanaTokenRpc = {
  getAccountInfo(mint: string): Promise<SolanaMintAccountInfo | null>;
  getAssetMetadata?(mint: string): Promise<SolanaTokenMetadata | null>;
};

export type ResolveSolanaTokenResult =
  | { ok: true; preview: ResolvedCanvasToken }
  | {
      ok: false;
      error: "invalid_address" | "not_a_contract" | "timeout" | "unavailable";
    };

export type ResolveSolanaTokenDeps = {
  rpc?: SolanaTokenRpc;
  rpcUrl?: string;
  timeoutMs?: number;
  metadataTimeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export function solanaTokenExplorerUrl(mint: string): string {
  return `https://explorer.solana.com/address/${encodeURIComponent(mint)}`;
}

export function loadSolanaTokenPreviewRpcUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const url = env.SOLANA_RPC_URL?.trim();
  return url ? url : null;
}

export function isSolanaTokenProgramOwner(owner: string): boolean {
  return (
    owner === SOLANA_TOKEN_PROGRAM_ID || owner === SOLANA_TOKEN_2022_PROGRAM_ID
  );
}

/**
 * Parse SPL / Token-2022 mint account bytes (base64 from getAccountInfo).
 * Returns null when the account is not an initialized mint.
 */
export function parseSolanaMintDecimals(
  dataBase64: string,
): number | null {
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(dataBase64, "base64"));
  } catch {
    return null;
  }
  if (bytes.length < SOLANA_MINT_ACCOUNT_MIN_SIZE) return null;
  if (bytes[MINT_INITIALIZED_OFFSET] !== 1) return null;
  const decimals = bytes[MINT_DECIMALS_OFFSET]!;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    return null;
  }
  return decimals;
}

export async function resolveSolanaToken(
  raw: unknown,
  deps: ResolveSolanaTokenDeps = {},
): Promise<ResolveSolanaTokenResult> {
  const classified = classifyTokenInput(raw);
  if (classified.kind !== "solana") {
    return { ok: false, error: "invalid_address" };
  }
  const address = classified.address.trim();
  if (!address) {
    return { ok: false, error: "invalid_address" };
  }

  const timeoutMs = deps.timeoutMs ?? SOLANA_TOKEN_RESOLVE_TIMEOUT_MS;
  const metadataTimeoutMs =
    deps.metadataTimeoutMs ?? SOLANA_TOKEN_METADATA_TIMEOUT_MS;

  let rpc = deps.rpc;
  if (!rpc) {
    const rpcUrl = (deps.rpcUrl ?? loadSolanaTokenPreviewRpcUrl())?.trim();
    if (!rpcUrl) {
      return { ok: false, error: "unavailable" };
    }
    rpc = createSolanaTokenRpc(rpcUrl, {
      timeoutMs,
      fetchImpl: deps.fetchImpl,
    });
  }

  let account: SolanaMintAccountInfo | null;
  try {
    account = await withTimeout(rpc.getAccountInfo(address), timeoutMs);
  } catch (err) {
    return { ok: false, error: isTimeoutError(err) ? "timeout" : "unavailable" };
  }

  if (!account || !isSolanaTokenProgramOwner(account.owner)) {
    return { ok: false, error: "not_a_contract" };
  }

  const decimals = parseSolanaMintDecimals(account.dataBase64);
  if (decimals === null) {
    return { ok: false, error: "not_a_contract" };
  }

  let metadata: SolanaTokenMetadata = {
    name: null,
    symbol: null,
    imageUrl: null,
  };
  if (typeof rpc.getAssetMetadata === "function") {
    try {
      const fetched = await withTimeout(
        rpc.getAssetMetadata(address),
        metadataTimeoutMs,
      );
      if (fetched) metadata = fetched;
    } catch {
      /* metadata is optional — mint alone is enough to place */
    }
  }

  const preview = normalizeResolvedCanvasToken({
    chain: "solana",
    address,
    explorerUrl: solanaTokenExplorerUrl(address),
    sourceLabel: SOLANA_TOKEN_SOURCE_LABEL,
    decimals,
    ...(metadata.name ? { name: metadata.name } : {}),
    ...(metadata.symbol ? { symbol: metadata.symbol } : {}),
    ...(metadata.imageUrl ? { imageUrl: metadata.imageUrl } : {}),
  });
  if (!preview) {
    return { ok: false, error: "unavailable" };
  }
  return { ok: true, preview };
}

export function createSolanaTokenRpc(
  rpcUrl: string,
  options: {
    timeoutMs: number;
    fetchImpl?: typeof fetch;
  },
): SolanaTokenRpc {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs;

  return {
    async getAccountInfo(mint) {
      const payload = await postJsonRpc(fetchImpl, rpcUrl, {
        method: "getAccountInfo",
        params: [
          mint,
          { encoding: "base64", commitment: "confirmed" },
        ],
        timeoutMs,
      });
      const value = readJsonRpcValue(payload);
      if (value === null) return null;
      if (value === undefined || typeof value !== "object") {
        throw new Error("rpc_shape");
      }
      const record = value as Record<string, unknown>;
      if (typeof record.owner !== "string") throw new Error("rpc_shape");
      const data = record.data;
      let dataBase64: string | null = null;
      if (Array.isArray(data) && typeof data[0] === "string") {
        dataBase64 = data[0];
      } else if (typeof data === "string") {
        dataBase64 = data;
      }
      if (!dataBase64) throw new Error("rpc_shape");
      const lamports =
        typeof record.lamports === "number" ? record.lamports : 0;
      return {
        owner: record.owner,
        dataBase64,
        lamports,
      };
    },
    async getAssetMetadata(mint) {
      try {
        const payload = await postJsonRpc(fetchImpl, rpcUrl, {
          method: "getAsset",
          params: { id: mint },
          timeoutMs,
        });
        return parseHeliusAssetMetadata(payload);
      } catch {
        return null;
      }
    },
  };
}

function parseHeliusAssetMetadata(
  payload: unknown,
): SolanaTokenMetadata | null {
  const value = readJsonRpcValue(payload);
  if (value === null || value === undefined || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const content =
    record.content !== null && typeof record.content === "object"
      ? (record.content as Record<string, unknown>)
      : null;
  const meta =
    content?.metadata !== null && typeof content?.metadata === "object"
      ? (content.metadata as Record<string, unknown>)
      : null;
  const links =
    content?.links !== null && typeof content?.links === "object"
      ? (content.links as Record<string, unknown>)
      : null;

  const name = typeof meta?.name === "string" ? meta.name : null;
  const symbol = typeof meta?.symbol === "string" ? meta.symbol : null;
  let imageUrl: string | null =
    typeof links?.image === "string" ? links.image : null;
  if (!imageUrl && Array.isArray(content?.files)) {
    for (const file of content.files) {
      if (file !== null && typeof file === "object") {
        const uri = (file as Record<string, unknown>).uri;
        if (typeof uri === "string" && uri.trim()) {
          imageUrl = uri;
          break;
        }
      }
    }
  }

  if (!name && !symbol && !imageUrl) return null;
  return { name, symbol, imageUrl };
}

async function postJsonRpc(
  fetchImpl: typeof fetch,
  rpcUrl: string,
  input: {
    method: string;
    params: unknown;
    timeoutMs: number;
  },
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "4663-token-preview",
        method: input.method,
        params: input.params,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`http_${response.status}`);
    }
    return await response.json();
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === "AbortError" || err.message === "timeout")
    ) {
      throw new Error("timeout");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function readJsonRpcValue(payload: unknown): unknown {
  if (payload === null || typeof payload !== "object") {
    throw new Error("rpc_shape");
  }
  const record = payload as Record<string, unknown>;
  if (record.error != null) {
    throw new Error("rpc_error");
  }
  if (!("result" in record)) {
    throw new Error("rpc_shape");
  }
  const result = record.result;
  if (result === null) return null;
  if (result !== null && typeof result === "object" && "value" in result) {
    return (result as { value: unknown }).value;
  }
  return result;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && err.message === "timeout";
}
