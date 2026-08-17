/**
 * POOLS catch-up must not starve PONS: one Instant range + one swap range
 * per continuous worker cycle, after PONS factory/transfer work.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { POOLS_CATCH_UP_MAX_RANGES_PER_CYCLE, PONS_V2_FEE_CATCH_UP_MAX_RANGES_PER_CYCLE } from "@/lib/worker/constants";
import { prepareStartupCursors } from "@/lib/worker/cursor-runtime";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function nthIndex(hay: string, needle: string, n: number): number {
  let idx = -1;
  for (let i = 0; i < n; i++) {
    idx = hay.indexOf(needle, idx + 1);
    if (idx < 0) return -1;
  }
  return idx;
}

function sliceCall(src: string, fnName: string, occurrence: number): string {
  const start = nthIndex(src, `${fnName}({`, occurrence);
  assert.ok(start >= 0, `missing ${fnName} occurrence ${occurrence}`);
  const end = src.indexOf("});", start);
  assert.ok(end > start, `unterminated ${fnName} occurrence ${occurrence}`);
  return src.slice(start, end);
}

describe("POOLS catch-up scheduling vs PONS", () => {
  const worker = readSrc("scripts/worker.ts");
  const pollIdx = worker.indexOf("poll every");
  assert.ok(pollIdx > 0);
  const startup = worker.slice(0, pollIdx);
  const poll = worker.slice(pollIdx);
  const swapLoop = readSrc("src/lib/worker/pools/swap-loop.ts");

  it("bounds POOLS to one outer range per cycle", () => {
    assert.equal(POOLS_CATCH_UP_MAX_RANGES_PER_CYCLE, 1);
    assert.equal(PONS_V2_FEE_CATCH_UP_MAX_RANGES_PER_CYCLE, 1);
  });

  it("startup: PONS factory then transfer then bounded Instant then bounded swap", () => {
    const factory = startup.indexOf("catchUpFactoryCursor({");
    const transfer = startup.indexOf("catchUpTransferCursor({");
    const instant = startup.indexOf("catchUpPoolsInstantCursorIsolated({");
    const swap = startup.indexOf("catchUpPoolsSwapCursorIsolated({");
    const fees = startup.indexOf("catchUpPonsV2CurveFeesCursorIsolated({");
    assert.ok(factory >= 0 && transfer > factory);
    assert.ok(instant > transfer && swap > instant);
    assert.ok(fees > swap);

    const instantCall = sliceCall(startup, "catchUpPoolsInstantCursorIsolated", 1);
    const swapCall = sliceCall(startup, "catchUpPoolsSwapCursorIsolated", 1);
    const feeCall = sliceCall(startup, "catchUpPonsV2CurveFeesCursorIsolated", 1);
    assert.ok(instantCall.includes("maxRanges: POOLS_CATCH_UP_MAX_RANGES_PER_CYCLE"));
    assert.ok(swapCall.includes("maxRanges: POOLS_CATCH_UP_MAX_RANGES_PER_CYCLE"));
    assert.ok(feeCall.includes("maxRanges: PONS_V2_FEE_CATCH_UP_MAX_RANGES_PER_CYCLE"));
    assert.equal(instantCall.includes("once ? 1 : undefined"), false);
    assert.equal(swapCall.includes("once ? 1 : undefined"), false);
    assert.equal(feeCall.includes("once ? 1 : undefined"), false);
  });

  it("startup: PONS catch-up stays unbounded in continuous mode", () => {
    const factoryCall = sliceCall(startup, "catchUpFactoryCursor", 1);
    const transferCall = sliceCall(startup, "catchUpTransferCursor", 1);
    assert.ok(factoryCall.includes("maxRanges: once ? 1 : undefined"));
    assert.ok(transferCall.includes("maxRanges: once ? 1 : undefined"));
  });

  it("poll: PONS then at most one Instant range and one swap range", () => {
    const factory = poll.indexOf("catchUpFactoryCursor({");
    const transfer = poll.indexOf("catchUpTransferCursor({");
    const instant = poll.indexOf("catchUpPoolsInstantCursorIsolated({");
    const swap = poll.indexOf("catchUpPoolsSwapCursorIsolated({");
    const fees = poll.indexOf("catchUpPonsV2CurveFeesCursorIsolated({");
    assert.ok(factory >= 0 && transfer > factory);
    assert.ok(instant > transfer && swap > instant);
    assert.ok(fees > swap);

    const instantCall = sliceCall(poll, "catchUpPoolsInstantCursorIsolated", 1);
    const swapCall = sliceCall(poll, "catchUpPoolsSwapCursorIsolated", 1);
    const feeCall = sliceCall(poll, "catchUpPonsV2CurveFeesCursorIsolated", 1);
    assert.ok(instantCall.includes("maxRanges: POOLS_CATCH_UP_MAX_RANGES_PER_CYCLE"));
    assert.ok(swapCall.includes("maxRanges: POOLS_CATCH_UP_MAX_RANGES_PER_CYCLE"));
    assert.ok(feeCall.includes("maxRanges: PONS_V2_FEE_CATCH_UP_MAX_RANGES_PER_CYCLE"));
  });

  it("poll starts only after startup catch-up returns (no until-head POOLS wait)", () => {
    const catchUpEnd = worker.indexOf("withCatchUpHeartbeat");
    const pollTimer = worker.indexOf("const pollTimer = setInterval");
    assert.ok(catchUpEnd >= 0 && pollTimer > catchUpEnd);
    assert.equal(startup.includes("maxRanges: once ? 1 : undefined"), true);
    assert.equal(
      worker.includes("catchUpPoolsInstantCursorIsolated") &&
        /catchUpPoolsInstantCursorIsolated\([\s\S]*?maxRanges: once \? 1 : undefined/.test(
          worker,
        ),
      false,
    );
  });

  it("nested Instant inside a swap range is also bounded", () => {
    assert.ok(swapLoop.includes("catchUpPoolsInstantCursor"));
    assert.ok(
      swapLoop.includes(
        "maxRanges: input.maxRanges ?? POOLS_CATCH_UP_MAX_RANGES_PER_CYCLE",
      ),
    );
    assert.ok(swapLoop.includes("instant.lastProcessedBlock < to"));
  });

  it("existing POOLS cursors resume from stored last_processed_block", () => {
    const plans = prepareStartupCursors(
      new Map([
        [
          "pools_instant",
          {
            streamName: "pools_instant",
            chainId: 4663,
            lastProcessedBlock: 37_425_250,
          },
        ],
        [
          "pools_swaps",
          {
            streamName: "pools_swaps",
            chainId: 4663,
            lastProcessedBlock: 34_867_262,
          },
        ],
      ]),
    );
    const instant = plans.find((p) => p.streamName === "pools_instant")!;
    const swaps = plans.find((p) => p.streamName === "pools_swaps")!;
    assert.equal(instant.lastProcessedBlock, 37_425_250);
    assert.equal(swaps.lastProcessedBlock, 34_867_262);
    assert.ok(instant.startupFromBlock <= 37_425_250);
    assert.ok(swaps.startupFromBlock <= 34_867_262);
    assert.equal(worker.includes("recommendedPoolsStartBlock"), false);
    assert.equal(worker.includes("bootstrap-pools"), false);
  });

  it("POOLS failures are isolated from PONS on startup and poll", () => {
    assert.ok(startup.includes("catchUpPoolsInstantCursorIsolated"));
    assert.ok(startup.includes("catchUpPoolsSwapCursorIsolated"));
    assert.ok(poll.includes("catchUpPoolsInstantCursorIsolated"));
    assert.ok(poll.includes("catchUpPoolsSwapCursorIsolated"));
    assert.ok(poll.includes("catchUpPonsV2CurveFeesCursorIsolated"));
    assert.ok(poll.includes("pollBusy = false"));
  });
});
