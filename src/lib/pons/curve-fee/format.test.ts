/**
 * Native ETH formatting is only for the zero-address quote. Never Number.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NATIVE_QUOTE_TOKEN_ADDRESS } from "@/lib/pons/curve-fee/constants";
import {
  formatNativeQuoteWei18,
  formatQuoteAmountForDisplay,
  isNativeQuoteToken,
} from "@/lib/pons/curve-fee/format";

const NON_NATIVE = "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea";
const LIVE_MAX = BigInt("303733000000000000");

describe("quote amount display", () => {
  it("formats native ETH wei as an exact 18-decimal string", () => {
    assert.equal(isNativeQuoteToken(NATIVE_QUOTE_TOKEN_ADDRESS), true);
    const shown = formatQuoteAmountForDisplay(
      NATIVE_QUOTE_TOKEN_ADDRESS,
      LIVE_MAX,
    );
    assert.equal(shown.quoteKind, "native_eth");
    assert.equal(shown.raw, "303733000000000000");
    assert.equal(shown.formatted, "0.303733");
    assert.equal(formatNativeQuoteWei18(LIVE_MAX), "0.303733");
    assert.equal(formatNativeQuoteWei18(BigInt(1)), "0.000000000000000001");
    assert.notEqual(formatNativeQuoteWei18(BigInt(1)), String(Number(1) / 1e18));
  });

  it("does not format non-native quotes as ETH", () => {
    assert.equal(isNativeQuoteToken(NON_NATIVE), false);
    const shown = formatQuoteAmountForDisplay(NON_NATIVE, LIVE_MAX);
    assert.equal(shown.quoteKind, "non_native");
    assert.equal(shown.raw, "303733000000000000");
    assert.equal(shown.formatted, null);
  });

  it("does not assume 18 decimals for a non-zero quote token", () => {
    const shown = formatQuoteAmountForDisplay(NON_NATIVE, BigInt(1_000_000));
    assert.equal(shown.formatted, null);
    assert.equal(shown.raw, "1000000");
  });
});
