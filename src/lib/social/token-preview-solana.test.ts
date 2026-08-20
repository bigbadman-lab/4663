/**
 * Solana TOKEN resolver — mint check, optional DAS metadata, explorer URL.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSolanaTokenProgramOwner,
  parseSolanaMintDecimals,
  resolveSolanaToken,
  solanaTokenExplorerUrl,
  SOLANA_TOKEN_PROGRAM_ID,
  SOLANA_TOKEN_2022_PROGRAM_ID,
  type SolanaTokenRpc,
} from "@/lib/social/token-preview-solana";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SYSTEM = "11111111111111111111111111111111";

/** Minimal initialized mint: decimals=6 at offset 44, isInitialized=1 at 45. */
function mintBase64(decimals: number): string {
  const bytes = new Uint8Array(82);
  bytes[44] = decimals;
  bytes[45] = 1;
  return Buffer.from(bytes).toString("base64");
}

function rpc(overrides: Partial<SolanaTokenRpc> = {}): SolanaTokenRpc {
  return {
    getAccountInfo: async () => ({
      owner: SOLANA_TOKEN_PROGRAM_ID,
      dataBase64: mintBase64(6),
      lamports: 1,
    }),
    getAssetMetadata: async () => ({
      name: "USD Coin",
      symbol: "USDC",
      imageUrl: "https://example.com/usdc.png",
    }),
    ...overrides,
  };
}

describe("parseSolanaMintDecimals", () => {
  it("reads decimals from an initialized mint account", () => {
    assert.equal(parseSolanaMintDecimals(mintBase64(6)), 6);
    assert.equal(parseSolanaMintDecimals(mintBase64(9)), 9);
  });

  it("rejects uninitialized or short accounts", () => {
    const uninit = new Uint8Array(82);
    uninit[44] = 6;
    uninit[45] = 0;
    assert.equal(
      parseSolanaMintDecimals(Buffer.from(uninit).toString("base64")),
      null,
    );
    assert.equal(
      parseSolanaMintDecimals(Buffer.from(new Uint8Array(40)).toString("base64")),
      null,
    );
  });
});

describe("resolveSolanaToken", () => {
  it("resolves a valid SPL mint with metadata", async () => {
    const result = await resolveSolanaToken(USDC, { rpc: rpc() });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.preview.chain, "solana");
    assert.equal(result.preview.address, USDC);
    assert.equal(result.preview.name, "USD Coin");
    assert.equal(result.preview.symbol, "USDC");
    assert.equal(result.preview.decimals, 6);
    assert.equal(result.preview.sourceLabel, "SOLANA");
    assert.equal(result.preview.imageUrl, "https://example.com/usdc.png");
    assert.equal(result.preview.explorerUrl, solanaTokenExplorerUrl(USDC));
  });

  it("places a mint when DAS metadata is missing", async () => {
    const result = await resolveSolanaToken(USDC, {
      rpc: rpc({
        getAssetMetadata: async () => null,
      }),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.preview.decimals, 6);
    assert.equal(result.preview.name, undefined);
    assert.equal(result.preview.symbol, undefined);
    assert.equal("imageUrl" in result.preview, false);
  });

  it("accepts Token-2022 owners", async () => {
    const result = await resolveSolanaToken(USDC, {
      rpc: rpc({
        getAccountInfo: async () => ({
          owner: SOLANA_TOKEN_2022_PROGRAM_ID,
          dataBase64: mintBase64(9),
          lamports: 1,
        }),
        getAssetMetadata: async () => null,
      }),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.preview.decimals, 9);
    assert.equal(isSolanaTokenProgramOwner(SOLANA_TOKEN_2022_PROGRAM_ID), true);
  });

  it("rejects non-mint accounts and invalid input", async () => {
    const missing = await resolveSolanaToken(USDC, {
      rpc: rpc({ getAccountInfo: async () => null }),
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.error, "not_a_contract");

    const systemOwned = await resolveSolanaToken(SYSTEM, {
      rpc: rpc({
        getAccountInfo: async () => ({
          owner: SYSTEM,
          dataBase64: mintBase64(0),
          lamports: 1,
        }),
      }),
    });
    assert.equal(systemOwned.ok, false);
    if (!systemOwned.ok) assert.equal(systemOwned.error, "not_a_contract");

    const invalid = await resolveSolanaToken("0xabcdef0123456789abcdef0123456789abcdef01", {
      rpc: rpc(),
    });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.error, "invalid_address");
  });

  it("maps getAccountInfo timeout and RPC failure", async () => {
    const timeout = await resolveSolanaToken(USDC, {
      timeoutMs: 20,
      rpc: {
        getAccountInfo: () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  owner: SOLANA_TOKEN_PROGRAM_ID,
                  dataBase64: mintBase64(6),
                  lamports: 1,
                }),
              200,
            );
          }),
      },
    });
    assert.equal(timeout.ok, false);
    if (!timeout.ok) assert.equal(timeout.error, "timeout");

    const fail = await resolveSolanaToken(USDC, {
      rpc: rpc({
        getAccountInfo: async () => {
          throw new Error("rpc down");
        },
      }),
    });
    assert.equal(fail.ok, false);
    if (!fail.ok) assert.equal(fail.error, "unavailable");
  });

  it("does not leak RPC URLs in the snapshot", async () => {
    const result = await resolveSolanaToken(USDC, { rpc: rpc() });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const json = JSON.stringify(result.preview);
    assert.equal(json.includes("helius"), false);
    assert.equal(json.includes("api-key"), false);
    assert.equal(json.includes("SOLANA_RPC"), false);
  });

  it("returns unavailable when SOLANA_RPC_URL is missing", async () => {
    const result = await resolveSolanaToken(USDC, {
      rpcUrl: "",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "unavailable");
  });
});
