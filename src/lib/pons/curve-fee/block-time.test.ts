import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findBlockAtOrAfterUnix,
  findBlockForLookbackHours,
} from "@/lib/pons/curve-fee/block-time";

/** 2-second blocks: unix = 1_700_000_000 + 2 * blockNumber */
function lookup(secondsPerBlock = 2) {
  const genesis = 1_700_000_000;
  return {
    async getBlock(blockNumber: number) {
      if (!Number.isInteger(blockNumber) || blockNumber < 0) {
        throw new Error(`missing block ${blockNumber}`);
      }
      return {
        number: blockNumber,
        timestamp: genesis + secondsPerBlock * blockNumber,
      };
    },
  };
}

describe("findBlockAtOrAfterUnix", () => {
  it("returns the first block at or after the target timestamp", async () => {
    const found = await findBlockAtOrAfterUnix(lookup(), 1_000, 1_700_000_000 + 100);
    assert.equal(found.number, 50);
    assert.equal(found.timestamp, 1_700_000_100);
  });

  it("does not assume a fixed blocks-per-hour rate", async () => {
    const slow = await findBlockForLookbackHours(lookup(12), 10_000, 1);
    const fast = await findBlockForLookbackHours(lookup(1), 10_000, 1);
    assert.equal(slow.startBlock.number, 10_000 - 300);
    assert.equal(fast.startBlock.number, 10_000 - 3_600);
    assert.notEqual(slow.startBlock.number, fast.startBlock.number);
  });

  it("clamps to genesis when the lookback is older than the chain", async () => {
    const found = await findBlockForLookbackHours(lookup(), 100, 24);
    assert.equal(found.startBlock.number, 0);
  });
});
