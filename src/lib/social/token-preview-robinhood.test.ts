/**
 * Robinhood TOKEN resolver — contract check, ERC-20 metadata, explorer URL.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasDeployedContractBytecode,
  resolveRobinhoodToken,
  type RobinhoodTokenRpc,
} from "@/lib/social/token-preview-robinhood";

const ADDR = "0xABCDEF0123456789ABCDEF0123456789ABCDEF01";
const EOA = "0x1111111111111111111111111111111111111111";
const ZERO = "0x0000000000000000000000000000000000000000";

function rpc(overrides: Partial<RobinhoodTokenRpc> = {}): RobinhoodTokenRpc {
  return {
    getCode: async () => "0x6080604052",
    readName: async () => "Example Token",
    readSymbol: async () => "EX",
    readDecimals: async () => 18,
    ...overrides,
  };
}

describe("resolveRobinhoodToken", () => {
  it("resolves a valid ERC-20 contract", async () => {
    const result = await resolveRobinhoodToken(ADDR, { rpc: rpc() });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.preview.chain, "robinhood");
    assert.equal(result.preview.address, ADDR.toLowerCase());
    assert.equal(result.preview.name, "Example Token");
    assert.equal(result.preview.symbol, "EX");
    assert.equal(result.preview.decimals, 18);
    assert.equal(result.preview.sourceLabel, "ROBINHOOD");
    assert.equal(
      result.preview.explorerUrl,
      `https://robinhoodchain.blockscout.com/token/${ADDR.toLowerCase()}`,
    );
    assert.equal("imageUrl" in result.preview, false);
  });

  it("places a contract with incomplete metadata", async () => {
    const result = await resolveRobinhoodToken(ADDR, {
      rpc: rpc({
        readName: async () => null,
        readSymbol: async () => {
          throw new Error("revert");
        },
        readDecimals: async () => null,
      }),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.preview.name, undefined);
    assert.equal(result.preview.symbol, undefined);
    assert.equal(result.preview.decimals, undefined);
    assert.ok(result.preview.explorerUrl.startsWith("https://"));
  });

  it("rejects EOAs", async () => {
    const result = await resolveRobinhoodToken(EOA, {
      rpc: rpc({ getCode: async () => "0x" }),
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "not_a_contract");
    assert.equal(hasDeployedContractBytecode("0x"), false);
    assert.equal(hasDeployedContractBytecode(null), false);
  });

  it("rejects invalid and zero addresses", async () => {
    assert.equal((await resolveRobinhoodToken("0x1234", { rpc: rpc() })).ok, false);
    assert.equal((await resolveRobinhoodToken(ZERO, { rpc: rpc() })).ok, false);
    const invalid = await resolveRobinhoodToken("not-an-address", { rpc: rpc() });
    assert.equal(invalid.ok, false);
    if (invalid.ok) return;
    assert.equal(invalid.error, "invalid_address");
  });

  it("maps getCode timeout and RPC failure", async () => {
    const timeout = await resolveRobinhoodToken(ADDR, {
      timeoutMs: 20,
      rpc: {
        getCode: () => new Promise((resolve) => {
          setTimeout(() => resolve("0x6080"), 200);
        }),
        readName: async () => null,
        readSymbol: async () => null,
        readDecimals: async () => null,
      },
    });
    assert.equal(timeout.ok, false);
    if (!timeout.ok) assert.equal(timeout.error, "timeout");

    const fail = await resolveRobinhoodToken(ADDR, {
      rpc: rpc({
        getCode: async () => {
          throw new Error("rpc down");
        },
      }),
    });
    assert.equal(fail.ok, false);
    if (!fail.ok) assert.equal(fail.error, "unavailable");
  });

  it("canonicalizes mixed-case input", async () => {
    const result = await resolveRobinhoodToken(`  ${ADDR}  `, { rpc: rpc() });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.preview.address, ADDR.toLowerCase());
    assert.match(result.preview.explorerUrl, /0xabcdef0123456789abcdef0123456789abcdef01$/);
  });

  it("does not leak RPC URLs in the snapshot", async () => {
    const result = await resolveRobinhoodToken(ADDR, { rpc: rpc() });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(JSON.stringify(result.preview).includes("alchemy"), false);
    assert.equal(JSON.stringify(result.preview).includes("rpc"), false);
  });
});
