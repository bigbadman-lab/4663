/**
 * TOKEN input classifier — Robinhood/EVM vs Solana vs URL vs other.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyTokenInput,
  isSolanaPublicKeyCandidate,
} from "@/lib/social/token-classify";

const EVM = "0x1234567890123456789012345678901234567890";
const EVM_UPPER = "0xABCDEF0123456789ABCDEF0123456789ABCDEF01";
const TX =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const SOLANA_WSOL = "So11111111111111111111111111111111111111112";
const SOLANA_SYSTEM = "11111111111111111111111111111111";
const SOLANA_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

describe("classifyTokenInput", () => {
  it("classifies valid 0x + 40 hex as robinhood and lowercases", () => {
    const result = classifyTokenInput(`  ${EVM}  `);
    assert.deepEqual(result, {
      kind: "robinhood",
      address: EVM.toLowerCase(),
      raw: EVM,
    });
  });

  it("accepts uppercase hex as robinhood", () => {
    const result = classifyTokenInput(EVM_UPPER);
    assert.equal(result.kind, "robinhood");
    if (result.kind !== "robinhood") return;
    assert.equal(result.address, EVM_UPPER.toLowerCase());
    assert.equal(result.raw, EVM_UPPER);
  });

  it("rejects malformed EVM", () => {
    assert.equal(classifyTokenInput("0x1234").kind, "other");
    assert.equal(classifyTokenInput("0xgg").kind, "other");
    assert.equal(classifyTokenInput("1234567890123456789012345678901234567890").kind, "other");
  });

  it("rejects EVM transaction hashes", () => {
    const result = classifyTokenInput(TX);
    assert.equal(result.kind, "tx_hash");
    assert.equal(isSolanaPublicKeyCandidate(TX), false);
  });

  it("classifies valid Solana-shaped candidates and preserves case", () => {
    const wsol = classifyTokenInput(` ${SOLANA_WSOL} `);
    assert.equal(wsol.kind, "solana");
    if (wsol.kind !== "solana") return;
    assert.equal(wsol.address, SOLANA_WSOL);

    const system = classifyTokenInput(SOLANA_SYSTEM);
    assert.equal(system.kind, "solana");

    const usdc = classifyTokenInput(SOLANA_USDC);
    assert.equal(usdc.kind, "solana");
    if (usdc.kind !== "solana") return;
    assert.equal(usdc.address, SOLANA_USDC);
  });

  it("classifies public URLs as url", () => {
    assert.equal(classifyTokenInput("https://example.com/token").kind, "url");
    assert.equal(
      classifyTokenInput(
        "https://robinhoodchain.blockscout.com/token/0x1234567890123456789012345678901234567890",
      ).kind,
      "url",
    );
    assert.equal(classifyTokenInput("http://example.com").kind, "url");
  });

  it("classifies prose as other", () => {
    assert.equal(classifyTokenInput("hello canvas").kind, "other");
    assert.equal(classifyTokenInput("").kind, "other");
    assert.equal(classifyTokenInput("   ").kind, "other");
    assert.equal(classifyTokenInput(null).kind, "other");
  });

  it("lets EVM win before base58 heuristics", () => {
    const result = classifyTokenInput(EVM);
    assert.equal(result.kind, "robinhood");
    assert.equal(isSolanaPublicKeyCandidate(EVM), false);
  });

  it("rejects base58 with invalid alphabet or length", () => {
    assert.equal(isSolanaPublicKeyCandidate("0OIl"), false);
    assert.equal(isSolanaPublicKeyCandidate("abc"), false);
    assert.equal(classifyTokenInput("not-a-key").kind, "other");
  });
});
