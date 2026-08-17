/**
 * ChainRpc topic0 mapping: single signature vs OR-array. Existing callers unchanged.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { toEthGetLogsFilter, toViemGetLogTopics } from "@/lib/worker/chain/rpc";
import {
  PONS_V2_CURVE_BUY_TOPIC0,
  PONS_V2_CURVE_SELL_TOPIC0,
} from "@/lib/pons/curve-fee/constants";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("toViemGetLogTopics", () => {
  it("omits topics when topic0 is unset", () => {
    assert.equal(toViemGetLogTopics(undefined), undefined);
  });

  it("maps a single topic0 string to topics[0] = signature (existing callers)", () => {
    assert.deepEqual(toViemGetLogTopics(PONS_V2_CURVE_BUY_TOPIC0), [
      PONS_V2_CURVE_BUY_TOPIC0,
    ]);
  });

  it("maps a topic0 array to an eth_getLogs OR filter", () => {
    assert.deepEqual(
      toViemGetLogTopics([PONS_V2_CURVE_BUY_TOPIC0, PONS_V2_CURVE_SELL_TOPIC0]),
      [[PONS_V2_CURVE_BUY_TOPIC0, PONS_V2_CURVE_SELL_TOPIC0]],
    );
  });

  it("rejects an empty topic0 array", () => {
    assert.throws(() => toViemGetLogTopics([]));
  });
});

describe("toEthGetLogsFilter", () => {
  it("encodes a single topic0 as topics[0] = signature", () => {
    assert.deepEqual(
      toEthGetLogsFilter({
        address: "0x3162a6dfbf1f363f85f84c84ed83ba5d9044db9e",
        fromBlock: 33_486_660,
        toBlock: 33_487_660,
        topic0: PONS_V2_CURVE_BUY_TOPIC0,
      }),
      {
        address: "0x3162a6dfbf1f363f85f84c84ed83ba5d9044db9e",
        fromBlock: "0x1fef744",
        toBlock: "0x1fefb2c",
        topics: [PONS_V2_CURVE_BUY_TOPIC0],
      },
    );
  });

  it("encodes topic0 OR as topics[0] = [CurveBuy, CurveSell]", () => {
    assert.deepEqual(
      toEthGetLogsFilter({
        address: "0x3162a6dfbf1f363f85f84c84ed83ba5d9044db9e",
        fromBlock: 33_486_660,
        toBlock: 33_487_660,
        topic0: [PONS_V2_CURVE_BUY_TOPIC0, PONS_V2_CURVE_SELL_TOPIC0],
      }),
      {
        address: "0x3162a6dfbf1f363f85f84c84ed83ba5d9044db9e",
        fromBlock: "0x1fef744",
        toBlock: "0x1fefb2c",
        topics: [[PONS_V2_CURVE_BUY_TOPIC0, PONS_V2_CURVE_SELL_TOPIC0]],
      },
    );
  });
});

describe("getLogs sends eth_getLogs JSON-RPC so topics reach the node", () => {
  it("does not use viem client.getLogs (which ignores topics)", () => {
    const src = readSrc("src/lib/worker/chain/rpc.ts");
    assert.ok(src.includes('method: "eth_getLogs"'));
    assert.ok(src.includes("toEthGetLogsFilter"));
    assert.ok(src.includes("client.request"));
    assert.equal(src.includes("await client.getLogs"), false);
  });
});

describe("existing getLogs callers still pass a single string topic0 or omit it", () => {
  it("factory scanner omits topic0", () => {
    const src = readSrc("src/lib/worker/pons/factory-scanner.ts");
    assert.equal(src.includes("topic0:"), false);
    assert.ok(src.includes("rpc.getLogs({"));
  });

  it("transfer / instant / swap scanners pass one string topic0", () => {
    const transfer = readSrc("src/lib/worker/pons/transfer-scanner.ts");
    const instant = readSrc("src/lib/worker/pools/instant-scanner.ts");
    const swap = readSrc("src/lib/worker/pools/swap-scanner.ts");
    assert.ok(transfer.includes("topic0: ERC20_TRANSFER_TOPIC"));
    assert.ok(instant.includes("topic0: POOLS_TOKEN_LAUNCHED_TOPIC0"));
    assert.ok(swap.includes("topic0: POOLS_V4_SWAP_TOPIC0"));
    assert.equal(transfer.includes("PONS_V2_CURVE_FEE_TOPIC0S"), false);
    assert.equal(instant.includes("PONS_V2_CURVE_FEE_TOPIC0S"), false);
    assert.equal(swap.includes("PONS_V2_CURVE_FEE_TOPIC0S"), false);
  });
});
