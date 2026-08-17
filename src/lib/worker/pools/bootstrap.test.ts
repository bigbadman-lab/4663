/**
 * POOLS bootstrap is live-forward: default origin is current chain head.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  parsePoolsBootstrapArgs,
  poolsBootstrapLastProcessedBlock,
  resolvePoolsBootstrapOrigin,
} from "@/lib/worker/pools/bootstrap";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("POOLS cursor bootstrap origin", () => {
  it("sets last_processed_block to fromBlock - 1 for explicit origins", () => {
    assert.equal(poolsBootstrapLastProcessedBlock(34_002_667), 34_002_666);
    assert.equal(poolsBootstrapLastProcessedBlock(0), 0);
  });

  it("default origin is current head so the next scan begins at head + 1", () => {
    const origin = resolvePoolsBootstrapOrigin({ head: 38_876_471 });
    assert.equal(origin.lastProcessedBlock, 38_876_471);
    assert.equal(origin.nextScanFromBlock, 38_876_472);
    assert.equal(origin.reason, "chain head (forward only)");
    assert.deepEqual(parsePoolsBootstrapArgs([]), {
      fromBlock: null,
      lookback: null,
      force: false,
    });
  });

  it("--lookback covers the last k blocks through head", () => {
    const origin = resolvePoolsBootstrapOrigin({
      head: 1_000,
      lookback: 500,
    });
    assert.equal(origin.lastProcessedBlock, 500);
    assert.equal(origin.nextScanFromBlock, 501);
    assert.equal(origin.reason, "--lookback 500");
    assert.equal(
      parsePoolsBootstrapArgs(["--lookback", "500"]).lookback,
      500,
    );
  });

  it("--from-block sets next scan at n and rejects values past head + 1", () => {
    const origin = resolvePoolsBootstrapOrigin({
      head: 38_876_471,
      fromBlock: 38_876_000,
    });
    assert.equal(origin.lastProcessedBlock, 38_875_999);
    assert.equal(origin.nextScanFromBlock, 38_876_000);
    assert.equal(origin.reason, "--from-block");
    assert.equal(
      parsePoolsBootstrapArgs(["--from-block", "38876000"]).fromBlock,
      38_876_000,
    );
    assert.throws(
      () =>
        resolvePoolsBootstrapOrigin({
          head: 38_876_471,
          fromBlock: 38_876_473,
        }),
      /beyond head/,
    );
    assert.throws(
      () => parsePoolsBootstrapArgs(["--from-block", "nope"]),
      /non-negative integer/,
    );
    assert.throws(
      () => parsePoolsBootstrapArgs(["--from-block", "-1"]),
      /non-negative integer/,
    );
  });

  it("does not consult production or observation boundaries", () => {
    const bootstrap = readSrc("src/lib/worker/pools/bootstrap.ts");
    const script = readSrc("scripts/bootstrap-pools.ts");
    for (const src of [bootstrap, script]) {
      assert.equal(src.includes("loadProductionState"), false);
      assert.equal(src.includes("recommendedPoolsStartBlock"), false);
      assert.equal(src.includes("observationStartBlock"), false);
      assert.equal(src.includes("productionStartBlock"), false);
    }
    assert.equal(bootstrap.includes("PoolsBootstrapBoundary"), false);
    assert.throws(
      () => parsePoolsBootstrapArgs(["--from-boundary"]),
      /--from-boundary is removed/,
    );
    assert.throws(
      () =>
        parsePoolsBootstrapArgs(["--from-block", "1", "--lookback", "10"]),
      /use only one of --from-block or --lookback/,
    );
  });

  it("bootstraps both POOLS cursors identically and never writes PONS", () => {
    const script = readSrc("scripts/bootstrap-pools.ts");
    assert.ok(script.includes("CURSOR_STREAM_POOLS_INSTANT"));
    assert.ok(script.includes("CURSOR_STREAM_POOLS_SWAPS"));
    const instantUpsert = script.indexOf(
      "streamName: CURSOR_STREAM_POOLS_INSTANT",
    );
    const swapsUpsert = script.indexOf(
      "streamName: CURSOR_STREAM_POOLS_SWAPS",
    );
    assert.ok(instantUpsert >= 0 && swapsUpsert > instantUpsert);
    assert.ok(script.includes("lastProcessedBlock,"));
    assert.equal(script.includes("CURSOR_STREAM_PONS_FACTORIES"), false);
    assert.equal(script.includes("CURSOR_STREAM_PONS_TRANSFERS"), false);
    assert.ok(script.includes("PONS cursors were not read or written"));
    assert.equal(parsePoolsBootstrapArgs(["--force"]).force, true);
  });
});
