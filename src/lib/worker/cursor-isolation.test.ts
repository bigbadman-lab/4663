/**
 * Cursor identity isolation: PONS streams must not be reused for POOLS.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CURSOR_STREAM_PONS_FACTORIES,
  CURSOR_STREAM_PONS_TRANSFERS,
} from "@/lib/pons/constants";
import { CURSOR_STREAM_POOLS_INSTANT, CURSOR_STREAM_POOLS_SWAPS } from "@/lib/pools/constants";
import { PONS_CURSOR_STREAMS } from "@/lib/worker/repositories/cursors";
import type { CursorStreamName } from "@/lib/pons/types";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("cursor stream isolation", () => {
  it("four distinct stream names; PONS set excludes POOLS", () => {
    const streams: CursorStreamName[] = [
      CURSOR_STREAM_PONS_FACTORIES,
      CURSOR_STREAM_PONS_TRANSFERS,
      CURSOR_STREAM_POOLS_INSTANT,
      CURSOR_STREAM_POOLS_SWAPS,
    ];
    assert.equal(new Set(streams).size, 4);
    assert.equal(CURSOR_STREAM_PONS_FACTORIES, "pons_factories");
    assert.equal(CURSOR_STREAM_PONS_TRANSFERS, "pons_transfers");
    assert.equal(CURSOR_STREAM_POOLS_INSTANT, "pools_instant");
    assert.equal(CURSOR_STREAM_POOLS_SWAPS, "pools_swaps");
    assert.deepEqual([...PONS_CURSOR_STREAMS], [
      "pons_factories",
      "pons_transfers",
    ]);
    assert.equal(
      (PONS_CURSOR_STREAMS as readonly string[]).includes("pools_instant"),
      false,
    );
    assert.equal(
      (PONS_CURSOR_STREAMS as readonly string[]).includes("pools_swaps"),
      false,
    );
  });

  it("cutover SQL and plan mutate only PONS cursors", () => {
    const sql = readSrc(
      "supabase/migrations/20260811220000_stage7a_production_cutover.sql",
    );
    assert.ok(sql.includes("'pons_factories'"));
    assert.ok(sql.includes("'pons_transfers'"));
    assert.equal(sql.includes("pools_instant"), false);
    assert.equal(sql.includes("pools_swaps"), false);

    const plan = readSrc("src/lib/worker/cutover-plan.ts");
    assert.ok(plan.includes("pons_factories"));
    assert.ok(plan.includes("pons_transfers"));
    assert.equal(plan.includes("pools_instant"), false);
    assert.equal(plan.includes("pools_swaps"), false);
  });

  it("observation SQL does not reset or mention POOLS cursors", () => {
    const sql = readSrc(
      "supabase/migrations/20260812220000_observation_1a_forward_boundary.sql",
    );
    assert.ok(sql.includes("stream_name = 'pons_factories'"));
    assert.ok(sql.includes("stream_name = 'pons_transfers'"));
    assert.equal(sql.includes("pools_instant"), false);
    assert.equal(sql.includes("pools_swaps"), false);
  });

  it("PONS factory/transfer scanners never write POOLS cursors", () => {
    const factoryLoop = readSrc("src/lib/worker/pons/factory-loop.ts");
    const transferLoop = readSrc("src/lib/worker/pons/transfer-loop.ts");
    const factoryScanner = readSrc("src/lib/worker/pons/factory-scanner.ts");
    assert.ok(factoryLoop.includes("CURSOR_STREAM_PONS_FACTORIES"));
    assert.ok(transferLoop.includes("CURSOR_STREAM_PONS_TRANSFERS"));
    assert.equal(factoryLoop.includes("pools_instant"), false);
    assert.equal(transferLoop.includes("pools_instant"), false);
    assert.equal(factoryLoop.includes("pools_swaps"), false);
    assert.equal(transferLoop.includes("pools_swaps"), false);
    assert.equal(factoryScanner.includes("pools_instant"), false);
    assert.equal(factoryScanner.includes("TokenLaunched"), false);
  });

  it("Instant loop only advances pools_instant; worker isolates Instant failures", () => {
    const loop = readSrc("src/lib/worker/pools/instant-loop.ts");
    assert.ok(loop.includes("CURSOR_STREAM_POOLS_INSTANT"));
    assert.ok(loop.includes("catchUpPoolsInstantCursorIsolated"));
    assert.equal(loop.includes("CURSOR_STREAM_PONS_FACTORIES"), false);
    assert.equal(loop.includes("CURSOR_STREAM_PONS_TRANSFERS"), false);
    assert.equal(loop.includes("CURSOR_STREAM_POOLS_SWAPS"), false);

    const worker = readSrc("scripts/worker.ts");
    assert.ok(worker.includes("catchUpPoolsInstantCursorIsolated"));
    assert.ok(worker.includes("catchUpFactoryCursor"));
    assert.ok(worker.includes("catchUpTransferCursor"));
    assert.equal(worker.includes("scanPoolsInstantRange"), false);
  });

  it("swap loop only advances pools_swaps; isolated from PONS and Instant cursor writes", () => {
    const loop = readSrc("src/lib/worker/pools/swap-loop.ts");
    assert.ok(loop.includes("CURSOR_STREAM_POOLS_SWAPS"));
    assert.ok(loop.includes("catchUpPoolsSwapCursorIsolated"));
    assert.ok(loop.includes("CURSOR_STREAM_POOLS_INSTANT"));
    assert.equal(loop.includes("CURSOR_STREAM_PONS_FACTORIES"), false);
    assert.equal(loop.includes("CURSOR_STREAM_PONS_TRANSFERS"), false);
    assert.ok(loop.includes("instant.lastProcessedBlock < to"));

    const scanner = readSrc("src/lib/worker/pools/swap-scanner.ts");
    assert.ok(scanner.includes("RHC_UNISWAP_V4_POOL_MANAGER"));
    assert.ok(scanner.includes("POOLS_V4_SWAP_TOPIC0"));
    assert.ok(scanner.includes("poolsInstantBuyerFromTx"));
    assert.equal(scanner.includes("detectPonsBuyV0"), false);
    assert.equal(scanner.includes("CURSOR_STREAM_PONS_TRANSFERS"), false);

    const worker = readSrc("scripts/worker.ts");
    assert.ok(worker.includes("catchUpPoolsSwapCursorIsolated"));
    assert.equal(worker.includes("scanPoolsSwapRange"), false);
  });
});
