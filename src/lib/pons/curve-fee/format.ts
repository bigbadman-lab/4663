/**
 * Display helpers for quote-token amounts.
 * 18-decimal formatting is only for native ETH (zero address). Never use Number.
 */

import { NATIVE_QUOTE_TOKEN_ADDRESS } from "@/lib/pons/curve-fee/constants";
import { normalizeAddress } from "@/lib/worker/normalize";

export type QuoteAmountKind = "native_eth" | "non_native";

export type QuoteAmountDisplay = {
  raw: string;
  /** Set only for native ETH (zero-address pairToken). Never guessed. */
  formatted: string | null;
  quoteKind: QuoteAmountKind;
};

export function isNativeQuoteToken(address: string): boolean {
  return normalizeAddress(address) === NATIVE_QUOTE_TOKEN_ADDRESS;
}

/** Exact 18-decimal display for native ETH wei. Does not float. */
export function formatNativeQuoteWei18(raw: bigint): string {
  const negative = raw < BigInt(0);
  const value = negative ? -raw : raw;
  const digits = value.toString(10).padStart(19, "0");
  const whole = digits.slice(0, -18).replace(/^0+(?=\d)/, "");
  const frac = digits.slice(-18).replace(/0+$/, "");
  const text = frac.length > 0 ? `${whole}.${frac}` : whole;
  return negative ? `-${text}` : text;
}

export function formatQuoteAmountForDisplay(
  quoteTokenAddress: string,
  raw: bigint,
): QuoteAmountDisplay {
  const rawText = raw.toString(10);
  if (!isNativeQuoteToken(quoteTokenAddress)) {
    return { raw: rawText, formatted: null, quoteKind: "non_native" };
  }
  return {
    raw: rawText,
    formatted: formatNativeQuoteWei18(raw),
    quoteKind: "native_eth",
  };
}
