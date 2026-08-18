/**
 * Canvas TOKEN PlayHTML objects — chain-neutral snapshot at placement time.
 * Count is derived from page data keyed by ownerSessionId (refresh-durable).
 *
 * Future TOKEN modules should consume ResolvedCanvasToken / CanvasTokenObject
 * and must not import chain RPCs or explorer URL builders.
 */

import { formatShortAddress } from "@/lib/canvas/format-address";
import { clampCanvasPct } from "@/lib/social/ephemeral-text";
import { parsePublicHttpUrl } from "@/lib/social/link-url";
import {
  canonicalizeRobinhoodAddress,
  isSolanaPublicKeyCandidate,
} from "@/lib/social/token-classify";
import { isUuid, normalizeSessionId } from "@/lib/presence/session-id";

export const CANVAS_TOKENS_PAGE_DATA_NAME = "4663-canvas-tokens" as const;
export const CANVAS_TOKEN_MAX_PER_OWNER = 3 as const;
export const CANVAS_TOKEN_LIMIT_MESSAGE = "TOKEN LIMIT REACHED · MAX 3" as const;

export const TOKEN_NAME_MAX_LENGTH = 80 as const;
export const TOKEN_SYMBOL_MAX_LENGTH = 24 as const;
export const TOKEN_SOURCE_LABEL_MAX_LENGTH = 40 as const;

export type CanvasTokenChain = "robinhood" | "solana";

export type ResolvedCanvasToken = {
  chain: CanvasTokenChain;
  address: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  imageUrl?: string;
  explorerUrl: string;
  sourceLabel: string;
};

export type CanvasTokenObject = ResolvedCanvasToken & {
  tokenId: string;
  ownerSessionId: string;
  leftPct: number;
  topPct: number;
  createdAt: string;
};

export type CanvasTokensPageData = {
  tokens: CanvasTokenObject[];
};

export const EMPTY_CANVAS_TOKENS_PAGE_DATA: CanvasTokensPageData = {
  tokens: [],
};

export function playhtmlTokenElementId(tokenId: string): string {
  return `4663-token-${tokenId}`;
}

export function isCanvasTokenChain(value: unknown): value is CanvasTokenChain {
  return value === "robinhood" || value === "solana";
}

export function sanitizeTokenText(
  raw: unknown,
  maxLength: number,
): string | undefined {
  if (typeof raw !== "string") return undefined;
  const stripped = raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return undefined;
  return stripped.slice(0, maxLength);
}

export function sanitizeTokenDecimals(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isInteger(raw)) return undefined;
  if (raw < 0 || raw > 255) return undefined;
  return raw;
}

export function canonicalizeTokenAddress(
  chain: CanvasTokenChain,
  address: unknown,
): string | null {
  if (typeof address !== "string") return null;
  if (chain === "robinhood") {
    return canonicalizeRobinhoodAddress(address);
  }
  const trimmed = address.trim();
  if (!isSolanaPublicKeyCandidate(trimmed)) return null;
  return trimmed;
}

export function formatCanvasTokenAddress(
  token: Pick<ResolvedCanvasToken, "chain" | "address">,
): string {
  if (token.chain === "robinhood") {
    return formatShortAddress(token.address);
  }
  const address = token.address.trim();
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function normalizeResolvedCanvasToken(
  raw: unknown,
): ResolvedCanvasToken | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isCanvasTokenChain(record.chain)) return null;

  const address = canonicalizeTokenAddress(record.chain, record.address);
  if (!address) return null;

  if (typeof record.explorerUrl !== "string") return null;
  const explorer = parsePublicHttpUrl(record.explorerUrl);
  if (!explorer.ok) return null;

  const sourceLabel = sanitizeTokenText(
    record.sourceLabel,
    TOKEN_SOURCE_LABEL_MAX_LENGTH,
  );
  if (!sourceLabel) return null;

  const token: ResolvedCanvasToken = {
    chain: record.chain,
    address,
    explorerUrl: explorer.normalized,
    sourceLabel,
  };

  const name = sanitizeTokenText(record.name, TOKEN_NAME_MAX_LENGTH);
  const symbol = sanitizeTokenText(record.symbol, TOKEN_SYMBOL_MAX_LENGTH);
  const decimals = sanitizeTokenDecimals(record.decimals);
  const imageParsed =
    typeof record.imageUrl === "string"
      ? parsePublicHttpUrl(record.imageUrl)
      : null;

  if (name) token.name = name;
  if (symbol) token.symbol = symbol;
  if (decimals !== undefined) token.decimals = decimals;
  if (imageParsed?.ok) token.imageUrl = imageParsed.normalized;
  return token;
}

function isFinitePct(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function countCanvasTokensForOwner(
  data: CanvasTokensPageData,
  ownerSessionId: string,
): number {
  if (!isUuid(ownerSessionId)) return 0;
  const owner = normalizeSessionId(ownerSessionId);
  return data.tokens.filter((token) => token.ownerSessionId === owner).length;
}

export function canPlaceCanvasToken(
  data: CanvasTokensPageData,
  ownerSessionId: string,
): boolean {
  return countCanvasTokensForOwner(data, ownerSessionId) < CANVAS_TOKEN_MAX_PER_OWNER;
}

export function normalizeCanvasTokenObject(
  raw: unknown,
): CanvasTokenObject | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isUuid(record.tokenId)) return null;
  if (!isUuid(record.ownerSessionId)) return null;
  if (!isFinitePct(record.leftPct) || !isFinitePct(record.topPct)) return null;
  if (record.leftPct < -5 || record.leftPct > 105) return null;
  if (record.topPct < -5 || record.topPct > 105) return null;
  if (typeof record.createdAt !== "string" || record.createdAt.trim() === "") {
    return null;
  }
  if (!Number.isFinite(Date.parse(record.createdAt))) return null;

  const preview = normalizeResolvedCanvasToken(record);
  if (!preview) return null;

  const token: CanvasTokenObject = {
    ...preview,
    tokenId: normalizeSessionId(record.tokenId),
    ownerSessionId: normalizeSessionId(record.ownerSessionId),
    leftPct: record.leftPct,
    topPct: record.topPct,
    createdAt: record.createdAt,
  };
  return token;
}

export function normalizeCanvasTokensPageData(
  raw: unknown,
): CanvasTokensPageData {
  if (raw === null || typeof raw !== "object") return { tokens: [] };
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.tokens)) return { tokens: [] };

  const seen = new Set<string>();
  const tokens: CanvasTokenObject[] = [];
  for (const item of record.tokens) {
    const normalized = normalizeCanvasTokenObject(item);
    if (!normalized) continue;
    if (seen.has(normalized.tokenId)) continue;
    seen.add(normalized.tokenId);
    tokens.push(normalized);
  }
  return { tokens };
}

export type CreateCanvasTokenInput = {
  preview: ResolvedCanvasToken;
  ownerSessionId: string;
  leftPct: number;
  topPct: number;
  now?: () => Date;
  randomUUID?: () => string;
};

export type CreateCanvasTokenResult =
  | { ok: true; token: CanvasTokenObject }
  | { ok: false; error: string };

export function createCanvasTokenObject(
  input: CreateCanvasTokenInput,
): CreateCanvasTokenResult {
  if (!isUuid(input.ownerSessionId)) {
    return { ok: false, error: "Invalid session." };
  }
  const preview = normalizeResolvedCanvasToken(input.preview);
  if (!preview) {
    return { ok: false, error: "Invalid token." };
  }
  const randomUUID = input.randomUUID ?? (() => crypto.randomUUID());
  const now = input.now ?? (() => new Date());
  return {
    ok: true,
    token: {
      ...preview,
      tokenId: normalizeSessionId(randomUUID()),
      ownerSessionId: normalizeSessionId(input.ownerSessionId),
      leftPct: clampCanvasPct(input.leftPct),
      topPct: clampCanvasPct(input.topPct),
      createdAt: now().toISOString(),
    },
  };
}

export function upsertCanvasToken(
  data: CanvasTokensPageData,
  token: CanvasTokenObject,
): CanvasTokensPageData {
  const without = data.tokens.filter((item) => item.tokenId !== token.tokenId);
  return { tokens: [...without, token] };
}

export function removeCanvasToken(
  data: CanvasTokensPageData,
  tokenId: string,
): CanvasTokensPageData {
  return { tokens: data.tokens.filter((token) => token.tokenId !== tokenId) };
}

export function removeCanvasTokensByOwner(
  data: CanvasTokensPageData,
  ownerSessionId: string,
): CanvasTokensPageData {
  const owner = normalizeSessionId(ownerSessionId);
  return {
    tokens: data.tokens.filter((token) => token.ownerSessionId !== owner),
  };
}

export function retainCanvasTokensForPresentOwners(
  data: CanvasTokensPageData,
  presentSessionIds: ReadonlySet<string>,
): CanvasTokensPageData {
  return {
    tokens: data.tokens.filter((token) =>
      presentSessionIds.has(token.ownerSessionId),
    ),
  };
}

export type CommitCanvasTokenPublishResult =
  | { ok: true; pageData: CanvasTokensPageData; token: CanvasTokenObject }
  | { ok: false; reason: "not-ready" | "rejected" | "limit" };

export function commitCanvasTokenPublish(input: {
  previous: CanvasTokensPageData;
  token: CanvasTokenObject;
  ready: boolean;
}): CommitCanvasTokenPublishResult {
  if (!input.ready) {
    return { ok: false, reason: "not-ready" };
  }
  const token = normalizeCanvasTokenObject(input.token);
  if (!token) {
    return { ok: false, reason: "rejected" };
  }
  const previous = normalizeCanvasTokensPageData(input.previous);
  const replacing = previous.tokens.some((item) => item.tokenId === token.tokenId);
  if (!replacing && !canPlaceCanvasToken(previous, token.ownerSessionId)) {
    return { ok: false, reason: "limit" };
  }
  return {
    ok: true,
    token,
    pageData: upsertCanvasToken(previous, token),
  };
}
