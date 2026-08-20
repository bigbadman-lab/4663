/**
 * TOKEN preview orchestration + API route wiring.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { previewCanvasToken } from "@/lib/social/token-preview-server";
import { TOKEN_PREVIEW_API_PATH } from "@/lib/social/token-preview";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const ADDR = "0xabcdef0123456789abcdef0123456789abcdef01";
const SOLANA = "So11111111111111111111111111111111111111112";
const PREVIEW = {
  chain: "robinhood" as const,
  address: ADDR,
  name: "Example Token",
  symbol: "EX",
  decimals: 18,
  explorerUrl: `https://robinhoodchain.blockscout.com/token/${ADDR}`,
  sourceLabel: "ROBINHOOD",
};
const SOLANA_PREVIEW = {
  chain: "solana" as const,
  address: SOLANA,
  name: "Wrapped SOL",
  symbol: "SOL",
  decimals: 9,
  explorerUrl: `https://explorer.solana.com/address/${SOLANA}`,
  sourceLabel: "SOLANA",
};

describe("previewCanvasToken", () => {
  it("returns a Robinhood snapshot on success", async () => {
    const result = await previewCanvasToken(ADDR, {
      resolveRobinhood: async () => ({ ok: true, preview: PREVIEW }),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.preview.chain, "robinhood");
    assert.equal(result.preview.symbol, "EX");
  });

  it("returns invalid_input / invalid_address deterministically", async () => {
    const empty = await previewCanvasToken("   ");
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.error, "invalid_input");

    const junk = await previewCanvasToken("hello");
    assert.equal(junk.ok, false);
    if (!junk.ok) assert.equal(junk.error, "invalid_address");

    const tx = await previewCanvasToken(
      "0x1111111111111111111111111111111111111111111111111111111111111111",
    );
    assert.equal(tx.ok, false);
    if (!tx.ok) assert.equal(tx.error, "invalid_address");
  });

  it("routes Solana candidates to the Solana resolver", async () => {
    const result = await previewCanvasToken(SOLANA, {
      resolveSolana: async () => ({ ok: true, preview: SOLANA_PREVIEW }),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.preview.chain, "solana");
    assert.equal(result.preview.address, SOLANA);
    assert.equal(result.preview.sourceLabel, "SOLANA");
  });

  it("URLs are rejected as url", async () => {
    const result = await previewCanvasToken("https://example.com");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "url");
  });
});

describe("TOKEN preview API route", () => {
  it("POSTs raw, uses server preview, never logs RPC URLs", () => {
    const route = readSrc("src/app/api/social/token-preview/route.ts");
    assert.ok(route.includes("previewCanvasToken"));
    assert.ok(route.includes('error: "invalid_json"'));
    assert.ok(route.includes("Cache-Control"));
    assert.equal(route.includes("ALCHEMY_RPC_URL"), false);
    assert.equal(route.includes("SOLANA_RPC_URL"), false);
    assert.equal(route.includes("console."), false);
    const client = readSrc("src/lib/social/token-preview-client.ts");
    assert.ok(client.includes("TOKEN_PREVIEW_API_PATH"));
    assert.equal(client.includes('error: "solana_not_enabled"'), false);
    assert.equal(TOKEN_PREVIEW_API_PATH, "/api/social/token-preview");
    const server = readSrc("src/lib/social/token-preview-server.ts");
    assert.ok(server.includes("resolveSolanaToken"));
    assert.equal(server.includes("solana_not_enabled"), false);
  });
});
