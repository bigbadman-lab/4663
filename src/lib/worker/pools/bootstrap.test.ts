import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  poolsBootstrapLastProcessedBlock,
  recommendedPoolsStartBlock,
} from "@/lib/worker/pools/bootstrap";

describe("POOLS cursor bootstrap origin", () => {
  it("sets last_processed_block to fromBlock - 1", () => {
    assert.equal(poolsBootstrapLastProcessedBlock(34_002_667), 34_002_666);
    assert.equal(poolsBootstrapLastProcessedBlock(0), 0);
  });

  it("prefers observation X, else production B+1, never genesis", () => {
    assert.deepEqual(
      recommendedPoolsStartBlock({
        observationStartBlock: 34_100_000,
        productionStartBlock: 34_000_000,
      }),
      {
        fromBlock: 34_100_000,
        reason: "observation_start_block (forward watch launch_block >= X)",
      },
    );
    assert.deepEqual(
      recommendedPoolsStartBlock({
        observationStartBlock: null,
        productionStartBlock: 34_000_000,
      }),
      {
        fromBlock: 34_000_001,
        reason: "production_start_block + 1 (forward watch launch_block > B)",
      },
    );
    assert.throws(
      () =>
        recommendedPoolsStartBlock({
          observationStartBlock: null,
          productionStartBlock: null,
        }),
      /will not scan from genesis/,
    );
  });
});
