/**
 * Stage 7A production boundary + cutover plan + worker mode gates.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterProductionEligibleLaunches,
  isProductionEligibleLaunchBlock,
  PRODUCTION_CUTOVER_VERSION,
} from "@/lib/pons/production-boundary";
import {
  buildCutoverPlan,
  parseCutoverArgs,
  refuseSecondCutoverWhenPresent,
  shouldMutateCutover,
} from "@/lib/worker/cutover-plan";
import { requireProductionCutover } from "@/lib/worker/production-mode";
import {
  addActiveLaunchToMemory,
  reconstructWorkerMemory,
} from "@/lib/worker/state";
import type { ActiveLaunchRow, FirstBuyerRow } from "@/lib/worker/db-types";
import type { WorkerMemoryModel } from "@/lib/pons/types";
import { startupResumeBlock } from "@/lib/pons/eligibility";

const B = 34_000_000;

function launchRow(
  block: number,
  status: "active" | "fired" | "expired" = "active",
  token = `0x${block.toString(16).padStart(40, "0")}`,
): ActiveLaunchRow {
  return {
    chainId: 4663,
    tokenAddress: token,
    marketAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    factoryAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
    factoryVersion: "v1",
    launchTxHash:
      `0x${block.toString(16).padStart(64, "0")}`,
    launchBlockNumber: block,
    launchBlockTimestamp: new Date(1_700_000_000 * 1000).toISOString(),
    status,
  };
}

describe("Stage 7A production boundary", () => {
  it("F: launch at B does not count (eligibility is > B)", () => {
    assert.equal(isProductionEligibleLaunchBlock(B, B), false);
  });

  it("G: launch at B+1 counts", () => {
    assert.equal(isProductionEligibleLaunchBlock(B + 1, B), true);
  });

  it("E: startup rewind reads B-5 but pre-B launches not production-eligible", () => {
    const durableN = B;
    const resume = startupResumeBlock(durableN);
    assert.equal(resume, B - 5);
    // Logs may re-read B-5..B; none at or before B become watch eligible
    for (let blk = resume; blk <= B; blk++) {
      assert.equal(isProductionEligibleLaunchBlock(blk, B), false);
    }
  });

  it("H: old development ACTIVE excluded from reconstruct after filter", () => {
    const all = [
      launchRow(B - 100),
      launchRow(B),
      launchRow(B + 10),
      launchRow(B + 20),
    ];
    const eligible = filterProductionEligibleLaunches(all, B);
    assert.equal(eligible.length, 2);
    const mem = reconstructWorkerMemory(eligible, []);
    assert.equal(mem.activeTokens.size, 2);
    for (const t of mem.activeTokens.values()) {
      assert.ok(t.launchBlock > B);
    }
  });

  it("I: transfer RAM only holds production tokens → no first buyers for pre-boundary", () => {
    const pre = launchRow(B - 1);
    const post = launchRow(B + 5);
    const buyers: FirstBuyerRow[] = [
      {
        chainId: 4663,
        tokenAddress: pre.tokenAddress,
        walletAddress: "0x1111111111111111111111111111111111111111",
        firstBuyTxHash:
          "0x2222222222222222222222222222222222222222222222222222222222222222",
        firstBuyBlockNumber: B + 1,
        firstBuyBlockTimestamp: new Date().toISOString(),
      },
      {
        chainId: 4663,
        tokenAddress: post.tokenAddress,
        walletAddress: "0x3333333333333333333333333333333333333333",
        firstBuyTxHash:
          "0x4444444444444444444444444444444444444444444444444444444444444444",
        firstBuyBlockNumber: B + 6,
        firstBuyBlockTimestamp: new Date().toISOString(),
      },
    ];
    const mem = reconstructWorkerMemory(
      filterProductionEligibleLaunches([pre, post], B),
      buyers,
    );
    assert.equal(mem.activeTokens.has(pre.tokenAddress), false);
    assert.equal(mem.confirmedBuyers.has(pre.tokenAddress), false);
    assert.equal(mem.activeTokens.has(post.tokenAddress), true);
    assert.equal(mem.confirmedBuyers.get(post.tokenAddress)?.size, 1);
  });
});

describe("Stage 7A cutover plan / idempotency / dry-run", () => {
  it("A: no cutover marker → production worker gate refuses", () => {
    const gate = requireProductionCutover(null);
    assert.equal(gate.ok, false);
    if (!gate.ok) assert.equal(gate.reason, "no_cutover");
  });

  it("B: dry-run does not mutate (confirm required)", () => {
    assert.equal(shouldMutateCutover(false), false);
    assert.equal(shouldMutateCutover(true), true);
  });

  it("C: successful cutover plan aligns both cursors to B", () => {
    const plan = buildCutoverPlan(B);
    assert.equal(plan.cursorLastProcessedBlock, B);
    assert.equal(plan.firstExclusiveProductionBlock, B + 1);
    assert.equal(plan.cutoverVersion, PRODUCTION_CUTOVER_VERSION);
    assert.ok(plan.mutations.some((m) => m.includes("pons_factories")));
    assert.ok(plan.mutations.some((m) => m.includes("pons_transfers")));
    assert.ok(plan.mutations.every((m) => !m.includes("pools_instant")));
    assert.ok(plan.mutations.every((m) => !m.includes("pools_swaps")));
    assert.ok(
      plan.mutations.every(
        (m) => !m.toLowerCase().includes("delete pons_launches"),
      ),
    );
  });

  it("D: second cutover refuse", () => {
    assert.equal(refuseSecondCutoverWhenPresent(true), true);
    assert.equal(refuseSecondCutoverWhenPresent(false), false);
    const gate = requireProductionCutover({
      chainId: 4663,
      productionStartBlock: B,
      productionStartedAt: new Date().toISOString(),
      cutoverVersion: PRODUCTION_CUTOVER_VERSION,
      createdAt: new Date().toISOString(),
      observationStartBlock: null,
      observationStartedAt: null,
      observationVersion: null,
    });
    assert.equal(gate.ok, true);
  });

  it("parse args rejects ambiguous modes", () => {
    assert.equal(parseCutoverArgs([]).ok, false);
    assert.equal(
      parseCutoverArgs(["--from-head", "--from-block", "1"]).ok,
      false,
    );
    assert.deepEqual(parseCutoverArgs(["--from-head"]), {
      ok: true,
      mode: { kind: "from_head" },
      confirm: false,
    });
    assert.deepEqual(parseCutoverArgs(["--from-block", "100", "--confirm"]), {
      ok: true,
      mode: { kind: "from_block", block: 100 },
      confirm: true,
    });
  });

  it("J: cursors may diverge after live processing conceptually (alignment only at cutover)", () => {
    // After cutover, factories and transfers advance independently as long as
    // factory ≥ transfer barrier. Initial plan only requires equality at B.
    const plan = buildCutoverPlan(B);
    const factoriesLater = plan.cursorLastProcessedBlock + 50;
    const transfersLater = plan.cursorLastProcessedBlock + 40;
    assert.ok(factoriesLater >= transfersLater);
    assert.ok(factoriesLater !== transfersLater);
  });

  it("addActiveLaunchToMemory respects production boundary", () => {
    const memory: WorkerMemoryModel = {
      activeTokens: new Map(),
      continuationWatch: new Map(),
      continuationResolved: new Set(),
      confirmedBuyers: new Map(),
      rollingFirstBuyers: new Map(),
    };
    addActiveLaunchToMemory(
      memory,
      {
        tokenAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        marketAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        factoryAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
        factoryVersion: "v1",
        launchTxHash:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
        launchBlockNumber: B,
        launchBlockTimestampIso: new Date().toISOString(),
      },
      { productionStartBlock: B, observationStartBlock: null },
    );
    assert.equal(memory.activeTokens.size, 0);

    addActiveLaunchToMemory(
      memory,
      {
        tokenAddress: "0xdddddddddddddddddddddddddddddddddddddddd",
        marketAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        factoryAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
        factoryVersion: "v2",
        launchTxHash:
          "0x2222222222222222222222222222222222222222222222222222222222222222",
        launchBlockNumber: B + 1,
        launchBlockTimestampIso: new Date().toISOString(),
      },
      { productionStartBlock: B, observationStartBlock: null },
    );
    assert.equal(memory.activeTokens.size, 1);
  });

  it("addActiveLaunchToMemory respects observation boundary when X set", () => {
    const memory: WorkerMemoryModel = {
      activeTokens: new Map(),
      continuationWatch: new Map(),
      continuationResolved: new Set(),
      confirmedBuyers: new Map(),
      rollingFirstBuyers: new Map(),
    };
    const X = B + 1000;
    addActiveLaunchToMemory(
      memory,
      {
        tokenAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        marketAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        factoryAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
        factoryVersion: "v1",
        launchTxHash:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
        launchBlockNumber: X - 1,
        launchBlockTimestampIso: new Date().toISOString(),
      },
      { productionStartBlock: B, observationStartBlock: X },
    );
    assert.equal(memory.activeTokens.size, 0);

    addActiveLaunchToMemory(
      memory,
      {
        tokenAddress: "0xdddddddddddddddddddddddddddddddddddddddd",
        marketAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        factoryAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
        factoryVersion: "v2",
        launchTxHash:
          "0x2222222222222222222222222222222222222222222222222222222222222222",
        launchBlockNumber: X,
        launchBlockTimestampIso: new Date().toISOString(),
      },
      { productionStartBlock: B, observationStartBlock: X },
    );
    assert.equal(memory.activeTokens.size, 1);
  });
});
