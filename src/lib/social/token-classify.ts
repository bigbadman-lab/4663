/**
 * Pure TOKEN composer input classifier.
 * Distinguishes Robinhood/EVM-shaped addresses, Solana pubkey candidates, URLs,
 * and everything else. Does not RPC. Does not mutate TEXT/chat parsers.
 */

import { EVM_ADDRESS_RE, isEvmAddress } from "@/lib/canvas/format-address";
import { parsePublicHttpUrl } from "@/lib/social/link-url";

export const EVM_TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/** Bitcoin/Solana base58 alphabet (no 0 O I l). */
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const BASE58_MAP: ReadonlyMap<string, number> = new Map(
  [...BASE58_ALPHABET].map((char, index) => [char, index]),
);

export type ClassifiedTokenInput =
  | { kind: "robinhood"; address: string; raw: string }
  | { kind: "solana"; address: string; raw: string }
  | { kind: "url"; raw: string }
  | { kind: "tx_hash"; raw: string }
  | { kind: "other"; raw: string };

export function isEvmTxHash(value: string): boolean {
  return EVM_TX_HASH_RE.test(value.trim());
}

/**
 * True when `value` is a 32-byte public key in Solana base58 form.
 * Preserves caller casing; does not prove the account is a mint.
 */
export function isSolanaPublicKeyCandidate(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 32 || trimmed.length > 44) return false;
  return decodeBase58To32Bytes(trimmed) !== null;
}

export function canonicalizeRobinhoodAddress(value: string): string | null {
  const trimmed = value.trim();
  if (!EVM_ADDRESS_RE.test(trimmed) || !isEvmAddress(trimmed)) return null;
  return trimmed.toLowerCase();
}

export function classifyTokenInput(raw: unknown): ClassifiedTokenInput {
  if (typeof raw !== "string") {
    return { kind: "other", raw: "" };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { kind: "other", raw: "" };
  }

  const robinhood = canonicalizeRobinhoodAddress(trimmed);
  if (robinhood) {
    return { kind: "robinhood", address: robinhood, raw: trimmed };
  }

  if (isEvmTxHash(trimmed)) {
    return { kind: "tx_hash", raw: trimmed };
  }

  if (isTokenUrl(trimmed)) {
    return { kind: "url", raw: trimmed };
  }

  if (isSolanaPublicKeyCandidate(trimmed)) {
    return { kind: "solana", address: trimmed, raw: trimmed };
  }

  return { kind: "other", raw: trimmed };
}

function isTokenUrl(value: string): boolean {
  if (/^https?:\/\//i.test(value)) return true;
  return parsePublicHttpUrl(value).ok;
}

function decodeBase58To32Bytes(value: string): Uint8Array | null {
  let leadingOnes = 0;
  while (leadingOnes < value.length && value[leadingOnes] === "1") {
    leadingOnes += 1;
  }

  let num = BigInt(0);
  for (let i = leadingOnes; i < value.length; i += 1) {
    const digit = BASE58_MAP.get(value[i]!);
    if (digit === undefined) return null;
    num = num * BigInt(58) + BigInt(digit);
  }

  const rest: number[] = [];
  while (num > BigInt(0)) {
    rest.unshift(Number(num & BigInt(0xff)));
    num >>= BigInt(8);
  }

  if (leadingOnes + rest.length !== 32) return null;
  const bytes = new Uint8Array(32);
  bytes.set(rest, leadingOnes);
  return bytes;
}
