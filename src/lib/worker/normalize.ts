import type { Address, TxHash } from "@/lib/pons/types";

/** Normalise EVM addresses / hashes to lowercase for runtime + DB consistency. */
export function normalizeHex(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeAddress(value: string): Address {
  return normalizeHex(value);
}

export function normalizeTxHash(value: string): TxHash {
  return normalizeHex(value);
}

/** Convert timestamptz / ISO string to unix seconds (UTC). */
export function timestampToUnixSeconds(value: string | Date): number {
  const ms =
    typeof value === "string" ? Date.parse(value) : value.getTime();
  if (Number.isNaN(ms)) {
    throw new Error(`[4663-worker] invalid timestamp: ${String(value)}`);
  }
  return Math.floor(ms / 1000);
}
