/**
 * Stage 8A.7 — Summon Candidate B integrity (pure).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSummonEligibleLaunchBlock,
  verifyContinuationEventIntegrity,
} from "@/lib/events/summon-integrity";

const T0 = 1_700_000_000;
const PROD = 1_000;
const OBS = 2_000;

function iso(unix: number): string {
  return new Date(unix * 1000).toISOString();
}

describe("Stage 8A.7 summon launch boundary", () => {
  it("production exclusive + observation inclusive filter", () => {
    assert.equal(isSummonEligibleLaunchBlock(1000, PROD, null), false);
    assert.equal(isSummonEligibleLaunchBlock(1001, PROD, null), true);
    assert.equal(isSummonEligibleLaunchBlock(1999, PROD, OBS), false);
    assert.equal(isSummonEligibleLaunchBlock(2000, PROD, OBS), true);
  });
});

describe("Stage 8A.7 Candidate B integrity for Summon", () => {
  it("PASS for frozen rule; occurred_at = second continuation buyer", () => {
    const secondAt = T0 + 250;
    const report = verifyContinuationEventIntegrity({
      event: {
        id: "aaaaaaaa-bbbb-cccc-dddd-000000000001",
        tokenAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        occurredAt: iso(secondAt),
        triggerTxHash:
          "0x2222222222222222222222222222222222222222222222222222222222222222",
      },
      launch: {
        tokenAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        launchBlockNumber: 3000,
        launchBlockTimestamp: iso(T0),
      },
      buyers: [
        { firstBuyBlockTimestamp: iso(T0 + 10), firstBuyTxHash: `0x${"1".repeat(64)}` },
        {
          firstBuyBlockTimestamp: iso(T0 + 180),
          firstBuyTxHash: `0x${"3".repeat(64)}`,
        },
        {
          firstBuyBlockTimestamp: iso(secondAt),
          firstBuyTxHash:
            "0x2222222222222222222222222222222222222222222222222222222222222222",
        },
      ],
      productionStartBlock: PROD,
      observationStartBlock: OBS,
    });
    assert.equal(report.status, "PASS");
    assert.equal(report.pre180Count, 1);
    assert.equal(report.continuationWindowCount, 2);
    assert.equal(report.secondContinuationBuyerAt, iso(secondAt));
  });

  it("boundary: 179.999 pre; 180 cont; 299.999 cont; 300 excluded", () => {
    // buyerAgeSeconds floors; 179.999s → 179 pre; exactly 180 cont; 299.999 → 299 cont; 300 too_late
    const buyers = [
      { firstBuyBlockTimestamp: iso(T0 + 179), firstBuyTxHash: `0x${"a".repeat(64)}` },
      { firstBuyBlockTimestamp: iso(T0 + 180), firstBuyTxHash: `0x${"b".repeat(64)}` },
      { firstBuyBlockTimestamp: iso(T0 + 299), firstBuyTxHash: `0x${"c".repeat(64)}` },
      { firstBuyBlockTimestamp: iso(T0 + 300), firstBuyTxHash: `0x${"d".repeat(64)}` },
    ];
    const report = verifyContinuationEventIntegrity({
      event: {
        id: "aaaaaaaa-bbbb-cccc-dddd-000000000002",
        tokenAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        occurredAt: iso(T0 + 299),
        triggerTxHash: `0x${"c".repeat(64)}`,
      },
      launch: {
        tokenAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        launchBlockNumber: 3000,
        launchBlockTimestamp: iso(T0),
      },
      buyers,
      productionStartBlock: PROD,
      observationStartBlock: OBS,
    });
    assert.equal(report.pre180Count, 1);
    assert.equal(report.continuationWindowCount, 2);
    assert.equal(report.status, "PASS");
  });

  it("FAIL when occurred_at mismatches second continuation buyer", () => {
    const report = verifyContinuationEventIntegrity({
      event: {
        id: "aaaaaaaa-bbbb-cccc-dddd-000000000003",
        tokenAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
        occurredAt: iso(T0 + 180),
        triggerTxHash: `0x${"2".repeat(64)}`,
      },
      launch: {
        tokenAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
        launchBlockNumber: 3000,
        launchBlockTimestamp: iso(T0),
      },
      buyers: [
        { firstBuyBlockTimestamp: iso(T0 + 10), firstBuyTxHash: `0x${"1".repeat(64)}` },
        { firstBuyBlockTimestamp: iso(T0 + 180), firstBuyTxHash: `0x${"3".repeat(64)}` },
        { firstBuyBlockTimestamp: iso(T0 + 250), firstBuyTxHash: `0x${"2".repeat(64)}` },
      ],
      productionStartBlock: PROD,
      observationStartBlock: OBS,
    });
    assert.equal(report.status, "FAIL");
    assert.ok(report.reasons.some((r) => r.includes("occurred_at")));
  });

  it("FAIL pre-observation / pre-production launches", () => {
    const report = verifyContinuationEventIntegrity({
      event: {
        id: "aaaaaaaa-bbbb-cccc-dddd-000000000004",
        tokenAddress: "0xdddddddddddddddddddddddddddddddddddddddd",
        occurredAt: iso(T0 + 250),
      },
      launch: {
        tokenAddress: "0xdddddddddddddddddddddddddddddddddddddddd",
        launchBlockNumber: 1500,
        launchBlockTimestamp: iso(T0),
      },
      buyers: [
        { firstBuyBlockTimestamp: iso(T0 + 10) },
        { firstBuyBlockTimestamp: iso(T0 + 180) },
        { firstBuyBlockTimestamp: iso(T0 + 250) },
      ],
      productionStartBlock: PROD,
      observationStartBlock: OBS,
    });
    assert.equal(report.status, "FAIL");
    assert.ok(report.reasons.some((r) => r.includes("boundary")));
  });
});
