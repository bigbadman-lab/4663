/**
 * POOLS Instant scanner: topic0+strategy filter, persist table, no PONS cursors.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { encodeAbiParameters, pad, parseAbiParameters, zeroAddress } from "viem";
import {
  POOLS_INSTANT_STRATEGY_V3_2_0,
  POOLS_TOKEN_LAUNCHED_TOPIC0,
} from "@/lib/pools/addresses";
import { scanPoolsInstantRange } from "@/lib/worker/pools/instant-scanner";
import type { ChainRpc } from "@/lib/worker/chain/rpc";
import type { WorkerSupabase } from "@/lib/worker/supabase";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const TOKEN = "0x87380657b18eb20b57b66d9759de4262d2531fa2";
const POOL_ID =
  "0xf880faadd73dd6eca13ee7d1e3958e6aef3e65a114b4123fb4007f6069406444";
const RECIPIENT = "0xeff166aaf189323c58dc27ed1206eb2c37faacdf";
const TX =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function specimenLog() {
  return {
    address: POOLS_INSTANT_STRATEGY_V3_2_0,
    blockNumber: BigInt(35_000_100),
    transactionHash: TX,
    logIndex: 2,
    topics: [
      POOLS_TOKEN_LAUNCHED_TOPIC0,
      POOL_ID,
      pad(TOKEN as `0x${string}`),
      pad(RECIPIENT as `0x${string}`),
    ],
    data: encodeAbiParameters(
      parseAbiParameters(
        "address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks",
      ),
      [zeroAddress, TOKEN, 2500, 25, zeroAddress],
    ),
  };
}

describe("scanPoolsInstantRange", () => {
  it("filters Instant strategy + TokenLaunched topic0; persists pools_instant_launches only", async () => {
    const getLogsCalls: Array<Record<string, unknown>> = [];
    const inserts: unknown[] = [];

    const rpc = {
      async getLogs(input: {
        address?: string | string[];
        fromBlock: number;
        toBlock: number;
        topic0?: string;
      }) {
        getLogsCalls.push({ ...input });
        return [specimenLog()];
      },
      async getBlock(blockNumber: number) {
        return { number: blockNumber, timestamp: 1_700_000_000 };
      },
    } as unknown as ChainRpc;

    const supabase = {
      from(table: string) {
        assert.equal(table, "pools_instant_launches");
        return {
          insert(payload: unknown) {
            inserts.push(payload);
            return {
              select() {
                return {
                  maybeSingle: async () => ({
                    data: {
                      ...(payload as Record<string, unknown>),
                      launchpad: "pools",
                    },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      },
    } as unknown as WorkerSupabase;

    const result = await scanPoolsInstantRange({
      rpc,
      supabase,
      fromBlock: 35_000_100,
      toBlock: 35_000_100,
    });

    assert.equal(result.inserted, 1);
    assert.equal(result.fullyProcessed, true);
    assert.equal(getLogsCalls.length, 1);
    assert.equal(getLogsCalls[0]!.address, POOLS_INSTANT_STRATEGY_V3_2_0);
    assert.equal(getLogsCalls[0]!.topic0, POOLS_TOKEN_LAUNCHED_TOPIC0);
    const row = inserts[0] as Record<string, unknown>;
    assert.equal(row.launchpad, "pools");
    assert.equal(row.token_address, TOKEN);
    assert.equal(row.pool_id, POOL_ID);
    assert.equal(row.source_contract, POOLS_INSTANT_STRATEGY_V3_2_0);
    assert.equal(row.launched_token_currency_index, 1);
    assert.equal(row.factory_version, undefined);
    assert.equal(row.market_address, undefined);
  });

  it("does not import PONS factory scanner or transfer watch", () => {
    const scanner = readSrc("src/lib/worker/pools/instant-scanner.ts");
    assert.equal(scanner.includes("scanFactoryRange"), false);
    assert.equal(scanner.includes("CURSOR_STREAM_PONS_TRANSFERS"), false);
    assert.equal(scanner.includes("detectPonsBuyV0"), false);
    assert.ok(scanner.includes("topic0: POOLS_TOKEN_LAUNCHED_TOPIC0"));
    assert.ok(scanner.includes("insertPoolsInstantLaunchIdempotent"));
  });
});
