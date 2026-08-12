/**
 * Observation 1E — PONS CONTINUATION validation cohort reporter tests.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildContinuationCohort,
  evaluateCohortEvidence,
  formatCohortReportLines,
  partitionFirstBuyersForContinuation,
  requireObservationActive,
  sortContinuationEventsDeterministically,
  type ContinuationCohortEventRow,
  type ContinuationCohortFirstBuyerRow,
  type ContinuationCohortLaunchRow,
} from "@/lib/worker/continuation-cohort";
import { CONTINUATION_COHORT_READ_ONLY } from "@/lib/worker/repositories/continuation-cohort";

const X = 34_867_263;
const T0 = 1_700_000_000;

function isoFromUnix(unix: number): string {
  return new Date(unix * 1000).toISOString();
}

function launch(
  token: string,
  block: number,
  launchUnix = T0,
): ContinuationCohortLaunchRow {
  return {
    tokenAddress: token,
    marketAddress: "0x1111111111111111111111111111111111111111",
    factoryAddress: "0x2222222222222222222222222222222222222222",
    factoryVersion: "v2",
    launchBlockNumber: block,
    launchBlockTimestamp: isoFromUnix(launchUnix),
    launchTxHash:
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
}

function event(
  overrides: Partial<ContinuationCohortEventRow> & {
    id: string;
    tokenAddress: string;
    occurredAt: string;
    triggerBlockNumber: number;
  },
): ContinuationCohortEventRow {
  return {
    marketAddress: "0x1111111111111111111111111111111111111111",
    triggerTxHash:
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    tokenAgeSeconds: 200,
    newBuyers: 2,
    payload: {},
    ...overrides,
  };
}

function txHash(nibble: string): string {
  return `0x${nibble.repeat(64).slice(0, 64)}`;
}

function buyer(
  token: string,
  wallet: string,
  ageSeconds: number,
  txNibble: string,
  launchUnix = T0,
): ContinuationCohortFirstBuyerRow {
  return {
    tokenAddress: token,
    walletAddress: wallet,
    firstBuyTxHash: txHash(txNibble),
    firstBuyBlockNumber: 1000 + ageSeconds,
    firstBuyBlockTimestamp: isoFromUnix(launchUnix + ageSeconds),
  };
}

describe("Observation 1E requireObservationActive", () => {
  it("1. observation inactive → refuses", () => {
    const r = requireObservationActive(null);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.error, /not_active|observation_start_block/i);
  });

  it("observation active → ok", () => {
    const r = requireObservationActive(X);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.observationStartBlock, X);
  });
});

describe("Observation 1E cohort boundary + ordering", () => {
  it("2. pre-observation launch events are excluded", () => {
    const token = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const report = buildContinuationCohort({
      observationStartBlock: X,
      events: [
        event({
          id: "00000000-0000-0000-0000-000000000001",
          tokenAddress: token,
          occurredAt: isoFromUnix(T0 + 200),
          triggerBlockNumber: 10,
        }),
      ],
      launchesByToken: new Map([[token, launch(token, X - 1)]]),
      buyersByToken: new Map(),
    });
    assert.equal(report.qualifyingCount, 0);
  });

  it("3. post-observation continuation events are included", () => {
    const token = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const b1 = buyer(token, "0x1111111111111111111111111111111111111111", 10, "1");
    const b2 = buyer(token, "0x2222222222222222222222222222222222222222", 180, "2");
    const b3 = buyer(token, "0x3333333333333333333333333333333333333333", 200, "3");
    const report = buildContinuationCohort({
      observationStartBlock: X,
      events: [
        event({
          id: "00000000-0000-0000-0000-000000000002",
          tokenAddress: token,
          occurredAt: isoFromUnix(T0 + 200),
          triggerBlockNumber: 20,
          triggerTxHash: b3.firstBuyTxHash,
        }),
      ],
      launchesByToken: new Map([[token, launch(token, X)]]),
      buyersByToken: new Map([[token, [b1, b2, b3]]]),
    });
    assert.equal(report.qualifyingCount, 1);
    assert.equal(report.members[0]!.launchBlockNumber, X);
    assert.equal(report.members[0]!.evidenceCheck, "PASS");
  });

  it("4. cohort is deterministically ordered by occurred_at, block, id", () => {
    const t1 = "0x1111111111111111111111111111111111111111";
    const t2 = "0x2222222222222222222222222222222222222222";
    const t3 = "0x3333333333333333333333333333333333333333";
    const events = [
      event({
        id: "00000000-0000-0000-0000-000000000003",
        tokenAddress: t3,
        occurredAt: isoFromUnix(T0 + 100),
        triggerBlockNumber: 30,
      }),
      event({
        id: "00000000-0000-0000-0000-000000000001",
        tokenAddress: t1,
        occurredAt: isoFromUnix(T0 + 100),
        triggerBlockNumber: 10,
      }),
      event({
        id: "00000000-0000-0000-0000-000000000002",
        tokenAddress: t2,
        occurredAt: isoFromUnix(T0 + 50),
        triggerBlockNumber: 99,
      }),
    ];
    const sorted = sortContinuationEventsDeterministically(events);
    assert.equal(sorted[0]!.tokenAddress, t2);
    assert.equal(sorted[1]!.tokenAddress, t1);
    assert.equal(sorted[2]!.tokenAddress, t3);

    const report = buildContinuationCohort({
      observationStartBlock: X,
      events,
      launchesByToken: new Map([
        [t1, launch(t1, X)],
        [t2, launch(t2, X + 1)],
        [t3, launch(t3, X + 2)],
      ]),
      buyersByToken: new Map(),
    });
    assert.deepEqual(
      report.members.map((m) => m.tokenAddress),
      [t2, t1, t3],
    );
  });

  it("5. more than 20 events → only first 20 returned", () => {
    const events: ContinuationCohortEventRow[] = [];
    const launches = new Map<string, ContinuationCohortLaunchRow>();
    for (let i = 0; i < 25; i++) {
      const token = `0x${String(i).padStart(40, "a")}`;
      events.push(
        event({
          id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
          tokenAddress: token,
          occurredAt: isoFromUnix(T0 + i),
          triggerBlockNumber: i,
        }),
      );
      launches.set(token, launch(token, X + i));
    }
    const report = buildContinuationCohort({
      observationStartBlock: X,
      events,
      launchesByToken: launches,
      buyersByToken: new Map(),
      targetSize: 20,
    });
    assert.equal(report.qualifyingCount, 20);
    assert.equal(report.members.length, 20);
    assert.equal(report.members[0]!.position, 1);
    assert.equal(report.members[19]!.position, 20);
  });

  it("6. fewer than 20 → correct N/20", () => {
    const token = "0xcccccccccccccccccccccccccccccccccccccccc";
    const report = buildContinuationCohort({
      observationStartBlock: X,
      events: [
        event({
          id: "00000000-0000-0000-0000-000000000010",
          tokenAddress: token,
          occurredAt: isoFromUnix(T0 + 1),
          triggerBlockNumber: 1,
        }),
      ],
      launchesByToken: new Map([[token, launch(token, X)]]),
      buyersByToken: new Map(),
    });
    assert.equal(report.qualifyingCount, 1);
    const lines = formatCohortReportLines(report, 4663);
    assert.ok(lines.some((l) => l === "qualifying_events=1/20"));
    assert.ok(lines.some((l) => l === "cohort_progress=1/20"));
  });
});

describe("Observation 1E buyer age reconstruction", () => {
  it("7. exactly 180s continuation buyer qualifies", () => {
    const token = "0xdddddddddddddddddddddddddddddddddddddddd";
    const { earlyBuyers, continuationBuyers } =
      partitionFirstBuyersForContinuation(
        [
          buyer(token, "0x1111111111111111111111111111111111111111", 10, "a"),
          buyer(token, "0x2222222222222222222222222222222222222222", 180, "b"),
        ],
        isoFromUnix(T0),
      );
    assert.equal(earlyBuyers.length, 1);
    assert.equal(continuationBuyers.length, 1);
    assert.equal(continuationBuyers[0]!.ageSeconds, 180);
  });

  it("8. exactly 300s does not qualify as continuation", () => {
    const token = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const { continuationBuyers } = partitionFirstBuyersForContinuation(
      [
        buyer(token, "0x1111111111111111111111111111111111111111", 10, "a"),
        buyer(token, "0x2222222222222222222222222222222222222222", 180, "b"),
        buyer(token, "0x3333333333333333333333333333333333333333", 300, "c"),
      ],
      isoFromUnix(T0),
    );
    assert.equal(continuationBuyers.length, 1);
    assert.equal(continuationBuyers[0]!.ageSeconds, 180);
  });

  it("9. early buyer <180s is reconstructed correctly", () => {
    const token = "0xffffffffffffffffffffffffffffffffffffffff";
    const { earlyBuyers } = partitionFirstBuyersForContinuation(
      [
        buyer(token, "0x1111111111111111111111111111111111111111", 179, "a"),
        buyer(token, "0x2222222222222222222222222222222222222222", 180, "b"),
      ],
      isoFromUnix(T0),
    );
    assert.equal(earlyBuyers.length, 1);
    assert.equal(earlyBuyers[0]!.ageSeconds, 179);
  });

  it("10. trigger associates to continuation buyer #2", () => {
    const token = "0xabcabcabcabcabcabcabcabcabcabcabcabcabca";
    const b1 = buyer(token, "0x1111111111111111111111111111111111111111", 10, "1");
    const b2 = buyer(token, "0x2222222222222222222222222222222222222222", 180, "2");
    const b3 = buyer(token, "0x3333333333333333333333333333333333333333", 250, "3");
    const report = buildContinuationCohort({
      observationStartBlock: X,
      events: [
        event({
          id: "00000000-0000-0000-0000-000000000020",
          tokenAddress: token,
          occurredAt: b3.firstBuyBlockTimestamp,
          triggerBlockNumber: b3.firstBuyBlockNumber,
          triggerTxHash: b3.firstBuyTxHash,
        }),
      ],
      launchesByToken: new Map([[token, launch(token, X)]]),
      buyersByToken: new Map([[token, [b1, b2, b3]]]),
    });
    const m = report.members[0]!;
    assert.equal(m.continuationBuyer2!.walletAddress, b3.walletAddress);
    assert.equal(m.triggerTxHash, b3.firstBuyTxHash);
    assert.equal(m.triggerBuyerWallet, b3.walletAddress);
    assert.equal(m.triggerAgeSeconds, 250);
    assert.equal(m.evidenceCheck, "PASS");
  });

  it("11. missing evidence → REVIEW, not crash", () => {
    const token = "0x9999999999999999999999999999999999999999";
    const report = buildContinuationCohort({
      observationStartBlock: X,
      events: [
        event({
          id: "00000000-0000-0000-0000-000000000030",
          tokenAddress: token,
          occurredAt: isoFromUnix(T0 + 200),
          triggerBlockNumber: 1,
          triggerTxHash: null,
        }),
      ],
      launchesByToken: new Map([[token, launch(token, X)]]),
      buyersByToken: new Map([[token, []]]),
    });
    assert.equal(report.qualifyingCount, 1);
    assert.equal(report.members[0]!.evidenceCheck, "REVIEW");
    assert.ok(report.members[0]!.evidenceReasons.length > 0);

    const check = evaluateCohortEvidence({
      launchBlockNumber: X,
      observationStartBlock: X,
      earlyBuyers: [],
      continuationBuyer1: null,
      continuationBuyer2: null,
      triggerTxHash: null,
    });
    assert.equal(check.evidenceCheck, "REVIEW");
  });

  it("12. read-only repository path contains no mutation", async () => {
    assert.equal(CONTINUATION_COHORT_READ_ONLY, true);
    const { readFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const src = await readFile(
      resolve(
        process.cwd(),
        "src/lib/worker/repositories/continuation-cohort.ts",
      ),
      "utf8",
    );
    assert.equal(/\.(insert|update|delete|upsert)\s*\(/.test(src), false);
    assert.equal(/\.rpc\s*\(/.test(src), false);
  });
});

describe("Observation 1E format", () => {
  it("prints READY_FOR_MANUAL_REVIEW and NO CHANGES APPLIED", () => {
    const lines = formatCohortReportLines(
      {
        observationStartBlock: X,
        qualifyingCount: 0,
        targetSize: 20,
        members: [],
      },
      4663,
    );
    assert.ok(
      lines[0]?.includes("PONS CONTINUATION VALIDATION COHORT — READ ONLY"),
    );
    assert.ok(lines.includes("NO CHANGES APPLIED"));
    assert.ok(lines.includes("cohort_progress=0/20"));
  });
});
