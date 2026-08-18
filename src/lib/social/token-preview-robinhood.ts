/**
 * Server-only Robinhood Chain TOKEN resolver.
 * Constructs explorer URLs here so the canvas renderer stays chain-neutral.
 */

import {
  createPublicClient,
  defineChain,
  http,
  parseAbi,
  type Address,
} from "viem";
import { robinhoodChainTokenExplorerUrl } from "@/lib/canvas/blockscout";
import { CHAIN_ID } from "@/lib/pons/constants";
import {
  canonicalizeRobinhoodAddress,
  classifyTokenInput,
} from "@/lib/social/token-classify";
import {
  normalizeResolvedCanvasToken,
  type ResolvedCanvasToken,
} from "@/lib/social/canvas-token";
import { isZeroEvmAddress } from "@/lib/token/official";

export const ROBINHOOD_TOKEN_SOURCE_LABEL = "ROBINHOOD" as const;
export const ROBINHOOD_TOKEN_RESOLVE_TIMEOUT_MS = 8_000 as const;
export const ROBINHOOD_TOKEN_METADATA_TIMEOUT_MS = 4_000 as const;

const ERC20_STRING_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
]);

const ERC20_DECIMALS_ABI = parseAbi([
  "function decimals() view returns (uint8)",
]);

export type RobinhoodTokenRpc = {
  getCode(address: Address): Promise<string | null>;
  readName(address: Address): Promise<string | null>;
  readSymbol(address: Address): Promise<string | null>;
  readDecimals(address: Address): Promise<number | null>;
};

export type ResolveRobinhoodTokenResult =
  | { ok: true; preview: ResolvedCanvasToken }
  | {
      ok: false;
      error: "invalid_address" | "not_a_contract" | "timeout" | "unavailable";
    };

export type ResolveRobinhoodTokenDeps = {
  rpc?: RobinhoodTokenRpc;
  rpcUrl?: string;
  timeoutMs?: number;
  metadataTimeoutMs?: number;
};

export function hasDeployedContractBytecode(
  code: string | null | undefined,
): boolean {
  if (!code) return false;
  const trimmed = code.trim().toLowerCase();
  return trimmed !== "" && trimmed !== "0x" && trimmed !== "0x0";
}

export function loadTokenPreviewRpcUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const url = env.ALCHEMY_RPC_URL?.trim();
  return url ? url : null;
}

export async function resolveRobinhoodToken(
  raw: unknown,
  deps: ResolveRobinhoodTokenDeps = {},
): Promise<ResolveRobinhoodTokenResult> {
  const classified = classifyTokenInput(raw);
  if (classified.kind !== "robinhood") {
    return { ok: false, error: "invalid_address" };
  }
  const address = canonicalizeRobinhoodAddress(classified.address);
  if (!address || isZeroEvmAddress(address)) {
    return { ok: false, error: "invalid_address" };
  }

  const timeoutMs = deps.timeoutMs ?? ROBINHOOD_TOKEN_RESOLVE_TIMEOUT_MS;
  const metadataTimeoutMs =
    deps.metadataTimeoutMs ?? ROBINHOOD_TOKEN_METADATA_TIMEOUT_MS;

  let rpc = deps.rpc;
  if (!rpc) {
    const rpcUrl = deps.rpcUrl ?? loadTokenPreviewRpcUrl();
    if (!rpcUrl) {
      return { ok: false, error: "unavailable" };
    }
    rpc = createRobinhoodTokenRpc(rpcUrl, timeoutMs);
  }

  const typedAddress = address as Address;

  let code: string | null;
  try {
    code = await withTimeout(rpc.getCode(typedAddress), timeoutMs);
  } catch (err) {
    return { ok: false, error: isTimeoutError(err) ? "timeout" : "unavailable" };
  }

  if (!hasDeployedContractBytecode(code)) {
    return { ok: false, error: "not_a_contract" };
  }

  const metadata = await readErc20Metadata(rpc, typedAddress, metadataTimeoutMs);
  const preview = normalizeResolvedCanvasToken({
    chain: "robinhood",
    address,
    explorerUrl: robinhoodChainTokenExplorerUrl(address),
    sourceLabel: ROBINHOOD_TOKEN_SOURCE_LABEL,
    ...(metadata.name ? { name: metadata.name } : {}),
    ...(metadata.symbol ? { symbol: metadata.symbol } : {}),
    ...(metadata.decimals !== null ? { decimals: metadata.decimals } : {}),
  });
  if (!preview) {
    return { ok: false, error: "unavailable" };
  }
  return { ok: true, preview };
}

async function readErc20Metadata(
  rpc: RobinhoodTokenRpc,
  address: Address,
  timeoutMs: number,
): Promise<{
  name: string | null;
  symbol: string | null;
  decimals: number | null;
}> {
  const settled = await Promise.allSettled([
    withTimeout(rpc.readName(address), timeoutMs),
    withTimeout(rpc.readSymbol(address), timeoutMs),
    withTimeout(rpc.readDecimals(address), timeoutMs),
  ]);
  return {
    name: settled[0].status === "fulfilled" ? settled[0].value : null,
    symbol: settled[1].status === "fulfilled" ? settled[1].value : null,
    decimals: settled[2].status === "fulfilled" ? settled[2].value : null,
  };
}

export function createRobinhoodTokenRpc(
  rpcUrl: string,
  timeoutMs: number,
): RobinhoodTokenRpc {
  const client = createPublicClient({
    chain: defineChain({
      id: CHAIN_ID,
      name: "Robinhood Chain",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    }),
    transport: http(rpcUrl, { timeout: timeoutMs }),
  });

  return {
    async getCode(address) {
      const code = await client.getCode({ address });
      return code ?? null;
    },
    async readName(address) {
      try {
        const value = await client.readContract({
          address,
          abi: ERC20_STRING_ABI,
          functionName: "name",
        });
        return typeof value === "string" ? value : null;
      } catch {
        return null;
      }
    },
    async readSymbol(address) {
      try {
        const value = await client.readContract({
          address,
          abi: ERC20_STRING_ABI,
          functionName: "symbol",
        });
        return typeof value === "string" ? value : null;
      } catch {
        return null;
      }
    },
    async readDecimals(address) {
      try {
        const value = await client.readContract({
          address,
          abi: ERC20_DECIMALS_ABI,
          functionName: "decimals",
        });
        const n = typeof value === "number" ? value : Number(value);
        if (!Number.isInteger(n) || n < 0 || n > 255) return null;
        return n;
      } catch {
        return null;
      }
    },
  };
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
