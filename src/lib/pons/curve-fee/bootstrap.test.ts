/**
 * PONS V2 fee cursor bootstrap requires an explicit origin.
 * --lookback-hours is resolved from chain timestamps in the operator script.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  parsePonsV2FeeBootstrapArgs,
  ponsV2FeeBootstrapLastProcessedBlock,
  PONS_V2_FEE_BOOTSTRAP_ORIGIN_REQUIRED,
  resolvePonsV2FeeBootstrapOrigin,
} from "@/lib/pons/curve-fee/bootstrap";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("PONS V2 fee cursor bootstrap origin", () => {
  it("sets last_processed_block to fromBlock - 1 for explicit origins", () => {
    assert.equal(ponsV2FeeBootstrapLastProcessedBlock(33_486_660), 33_486_659);
    assert.equal(ponsV2FeeBootstrapLastProcessedBlock(0), 0);
  });

  it("refuses a missing origin instead of silently starting at head", () => {
    assert.throws(
      () => parsePonsV2FeeBootstrapArgs([]),
      (err: unknown) =>
        err instanceof Error &&
        err.message === PONS_V2_FEE_BOOTSTRAP_ORIGIN_REQUIRED,
    );
    assert.throws(
      () => resolvePonsV2FeeBootstrapOrigin({ head: 33_487_660 }),
      /required origin/,
    );
  });

  it("--from-head is the only forward-from-head origin", () => {
    const origin = resolvePonsV2FeeBootstrapOrigin({
      head: 33_487_660,
      fromHead: true,
    });
    assert.equal(origin.lastProcessedBlock, 33_487_660);
    assert.equal(origin.nextScanFromBlock, 33_487_661);
    assert.equal(origin.reason, "--from-head");
    assert.deepEqual(parsePonsV2FeeBootstrapArgs(["--from-head"]), {
      fromBlock: null,
      lookback: null,
      lookbackHours: null,
      fromHead: true,
      force: false,
    });
  });

  it("--from-block sets next scan at n and rejects values past head + 1", () => {
    const origin = resolvePonsV2FeeBootstrapOrigin({
      head: 33_487_660,
      fromBlock: 33_486_660,
    });
    assert.equal(origin.lastProcessedBlock, 33_486_659);
    assert.equal(origin.nextScanFromBlock, 33_486_660);
    assert.equal(origin.reason, "--from-block");
    assert.equal(
      parsePonsV2FeeBootstrapArgs(["--from-block", "33486660"]).fromBlock,
      33_486_660,
    );
    assert.throws(
      () =>
        resolvePonsV2FeeBootstrapOrigin({
          head: 33_487_660,
          fromBlock: 33_487_662,
        }),
      /beyond head/,
    );
  });

  it("--lookback-hours is parsed and cannot mix with other origins", () => {
    const parsed = parsePonsV2FeeBootstrapArgs(["--lookback-hours", "24"]);
    assert.equal(parsed.lookbackHours, 24);
    assert.equal(parsed.fromHead, false);
    assert.throws(
      () =>
        parsePonsV2FeeBootstrapArgs([
          "--lookback-hours",
          "24",
          "--from-head",
        ]),
      /use only one/,
    );
  });

  it("does not consult production or observation boundaries", () => {
    const bootstrap = readSrc("src/lib/pons/curve-fee/bootstrap.ts");
    const script = readSrc("scripts/bootstrap-pons-v2-fees.ts");
    for (const src of [bootstrap, script]) {
      assert.equal(src.includes("loadProductionState"), false);
      assert.equal(src.includes("observationStartBlock"), false);
      assert.equal(src.includes("productionStartBlock"), false);
    }
    assert.equal(script.includes("CURSOR_STREAM_PONS_FACTORIES"), false);
    assert.equal(script.includes("CURSOR_STREAM_PONS_TRANSFERS"), false);
    assert.equal(script.includes("CURSOR_STREAM_POOLS_INSTANT"), false);
    assert.ok(script.includes("CURSOR_STREAM_PONS_V2_CURVE_FEES"));
    assert.ok(script.includes("findBlockForLookbackHours"));
    assert.ok(script.includes("--lookback-hours"));
  });
});
