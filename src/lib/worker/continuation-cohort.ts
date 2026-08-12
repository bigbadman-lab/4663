/**
 * Observation 1E — pure PONS CONTINUATION validation cohort helpers.
 * Read-only reconstruction. No I/O. No mutation.
 */

import {
  buyerAgeBucket,
  buyerAgeSeconds,
  CONTINUATION_WINDOW_END_SECONDS,
  CONTINUATION_WINDOW_START_SECONDS,
} from "@/lib/pons/continuation";
import { timestampToUnixSeconds } from "@/lib/worker/normalize";

export const CONTINUATION_COHORT_TARGET = 20 as const;
export const CONTINUATION_EVENT_TYPE = "pons_buyer_continuation" as const;

export type CohortBuyerEvidence = {
  walletAddress: string;
  txHash: string;
  blockNumber: number;
  timestampIso: string;
  ageSeconds: number;
};

export type ContinuationCohortEventRow = {
  id: string;
  tokenAddress: string;
  marketAddress: string;
  occurredAt: string;
  triggerTxHash: string | null;
  triggerBlockNumber: number;
  tokenAgeSeconds: number;
  newBuyers: number;
  payload: Record<string, unknown>;
};

export type ContinuationCohortLaunchRow = {
  tokenAddress: string;
  marketAddress: string;
  factoryAddress: string;
  factoryVersion: string;
  launchBlockNumber: number;
  launchBlockTimestamp: string;
  launchTxHash: string;
};

export type ContinuationCohortFirstBuyerRow = {
  tokenAddress: string;
  walletAddress: string;
  firstBuyTxHash: string;
  firstBuyBlockNumber: number;
  firstBuyBlockTimestamp: string;
};

export type CohortMember = {
  position: number;
  targetSize: number;
  tokenAddress: string;
  marketAddress: string;
  factoryAddress: string;
  factoryVersion: string;
  launchBlockNumber: number;
  launchTimestampIso: string;
  launchTxHash: string;
  earlyBuyers: CohortBuyerEvidence[];
  continuationBuyer1: CohortBuyerEvidence | null;
  continuationBuyer2: CohortBuyerEvidence | null;
  eventId: string;
  eventBlockNumber: number;
  eventTimestampIso: string;
  triggerTxHash: string | null;
  triggerBuyerWallet: string | null;
  triggerAgeSeconds: number | null;
  evidenceCheck: "PASS" | "REVIEW";
  evidenceReasons: string[];
};

export type CohortReport = {
  observationStartBlock: number;
  qualifyingCount: number;
  targetSize: number;
  members: CohortMember[];
};

/** Refuse when observation is inactive. */
export function requireObservationActive(
  observationStartBlock: number | null,
): { ok: true; observationStartBlock: number } | { ok: false; error: string } {
  if (observationStartBlock === null) {
    return {
      ok: false,
      error:
        "observation_start_block is not_active — activate forward observation before running the continuation cohort reporter",
    };
  }
  if (!Number.isInteger(observationStartBlock) || observationStartBlock < 1) {
    return {
      ok: false,
      error: `invalid observation_start_block=${observationStartBlock}`,
    };
  }
  return { ok: true, observationStartBlock };
}

function compareEvents(
  a: ContinuationCohortEventRow,
  b: ContinuationCohortEventRow,
): number {
  const ta = Date.parse(a.occurredAt);
  const tb = Date.parse(b.occurredAt);
  if (ta !== tb) return ta - tb;
  if (a.triggerBlockNumber !== b.triggerBlockNumber) {
    return a.triggerBlockNumber - b.triggerBlockNumber;
  }
  return a.id.localeCompare(b.id);
}

export function sortContinuationEventsDeterministically(
  events: readonly ContinuationCohortEventRow[],
): ContinuationCohortEventRow[] {
  return [...events].sort(compareEvents);
}

function toBuyerEvidence(
  row: ContinuationCohortFirstBuyerRow,
  launchUnix: number,
): CohortBuyerEvidence {
  const buyUnix = timestampToUnixSeconds(row.firstBuyBlockTimestamp);
  return {
    walletAddress: row.walletAddress,
    txHash: row.firstBuyTxHash,
    blockNumber: row.firstBuyBlockNumber,
    timestampIso: row.firstBuyBlockTimestamp,
    ageSeconds: buyerAgeSeconds(buyUnix, launchUnix),
  };
}

/**
 * Partition first buyers using frozen PONS CONTINUATION age buckets.
 * Exactly 180s → continuation; exactly 300s → too_late (excluded).
 */
export function partitionFirstBuyersForContinuation(
  buyers: readonly ContinuationCohortFirstBuyerRow[],
  launchTimestampIso: string,
): {
  earlyBuyers: CohortBuyerEvidence[];
  continuationBuyers: CohortBuyerEvidence[];
} {
  const launchUnix = timestampToUnixSeconds(launchTimestampIso);
  const early: CohortBuyerEvidence[] = [];
  const continuation: CohortBuyerEvidence[] = [];

  for (const row of buyers) {
    const evidence = toBuyerEvidence(row, launchUnix);
    const bucket = buyerAgeBucket(evidence.ageSeconds);
    if (bucket === "pre") early.push(evidence);
    else if (bucket === "continuation") continuation.push(evidence);
  }

  const byTimeThenTx = (a: CohortBuyerEvidence, b: CohortBuyerEvidence) => {
    const ta = Date.parse(a.timestampIso);
    const tb = Date.parse(b.timestampIso);
    if (ta !== tb) return ta - tb;
    return a.txHash.localeCompare(b.txHash);
  };

  early.sort(byTimeThenTx);
  continuation.sort(byTimeThenTx);
  return { earlyBuyers: early, continuationBuyers: continuation };
}

export function evaluateCohortEvidence(input: {
  launchBlockNumber: number;
  observationStartBlock: number;
  earlyBuyers: readonly CohortBuyerEvidence[];
  continuationBuyer1: CohortBuyerEvidence | null;
  continuationBuyer2: CohortBuyerEvidence | null;
  triggerTxHash: string | null;
}): { evidenceCheck: "PASS" | "REVIEW"; evidenceReasons: string[] } {
  const reasons: string[] = [];

  if (input.launchBlockNumber < input.observationStartBlock) {
    reasons.push(
      `launch_block ${input.launchBlockNumber} < observation_start_block ${input.observationStartBlock}`,
    );
  }
  if (input.earlyBuyers.length < 1) {
    reasons.push("missing early first buyer with age < 180s");
  }
  if (!input.continuationBuyer1) {
    reasons.push("missing continuation_buyer_1 in [180s,300s)");
  } else {
    if (
      input.continuationBuyer1.ageSeconds < CONTINUATION_WINDOW_START_SECONDS ||
      input.continuationBuyer1.ageSeconds >= CONTINUATION_WINDOW_END_SECONDS
    ) {
      reasons.push(
        `continuation_buyer_1 age ${input.continuationBuyer1.ageSeconds}s outside [180,300)`,
      );
    }
  }
  if (!input.continuationBuyer2) {
    reasons.push("missing continuation_buyer_2 in [180s,300s)");
  } else {
    if (
      input.continuationBuyer2.ageSeconds < CONTINUATION_WINDOW_START_SECONDS ||
      input.continuationBuyer2.ageSeconds >= CONTINUATION_WINDOW_END_SECONDS
    ) {
      reasons.push(
        `continuation_buyer_2 age ${input.continuationBuyer2.ageSeconds}s outside [180,300)`,
      );
    }
  }
  if (
    input.continuationBuyer1 &&
    input.continuationBuyer2 &&
    input.continuationBuyer1.walletAddress ===
      input.continuationBuyer2.walletAddress
  ) {
    reasons.push("continuation_buyer_1 and _2 share the same wallet");
  }
  if (input.triggerTxHash && input.continuationBuyer2) {
    if (input.triggerTxHash !== input.continuationBuyer2.txHash) {
      reasons.push(
        `trigger_tx ${input.triggerTxHash} does not match continuation_buyer_2.tx ${input.continuationBuyer2.txHash}`,
      );
    }
  } else if (!input.triggerTxHash) {
    reasons.push("trigger_tx_hash unavailable on event");
  }

  return {
    evidenceCheck: reasons.length === 0 ? "PASS" : "REVIEW",
    evidenceReasons: reasons,
  };
}

/**
 * Build ordered cohort members from durable rows.
 * Pre-observation launches are excluded. Cap at targetSize (default 20).
 */
export function buildContinuationCohort(input: {
  observationStartBlock: number;
  events: readonly ContinuationCohortEventRow[];
  launchesByToken: ReadonlyMap<string, ContinuationCohortLaunchRow>;
  buyersByToken: ReadonlyMap<string, readonly ContinuationCohortFirstBuyerRow[]>;
  targetSize?: number;
}): CohortReport {
  const targetSize = input.targetSize ?? CONTINUATION_COHORT_TARGET;
  const ordered = sortContinuationEventsDeterministically(input.events);
  const members: CohortMember[] = [];

  for (const event of ordered) {
    if (members.length >= targetSize) break;
    const token = event.tokenAddress.toLowerCase();
    const launch = input.launchesByToken.get(token);
    if (!launch) {
      // Keep fired events without launch as REVIEW members? Spec: launch boundary
      // authoritative — exclude if we cannot prove launch >= X.
      continue;
    }
    if (launch.launchBlockNumber < input.observationStartBlock) {
      continue;
    }

    const buyers = input.buyersByToken.get(token) ?? [];
    const { earlyBuyers, continuationBuyers } =
      partitionFirstBuyersForContinuation(buyers, launch.launchBlockTimestamp);
    const continuationBuyer1 = continuationBuyers[0] ?? null;
    const continuationBuyer2 = continuationBuyers[1] ?? null;

    let triggerBuyerWallet: string | null = null;
    let triggerAgeSeconds: number | null = null;
    if (event.triggerTxHash) {
      const match = buyers.find(
        (b) =>
          b.firstBuyTxHash.toLowerCase() === event.triggerTxHash!.toLowerCase(),
      );
      if (match) {
        const launchUnix = timestampToUnixSeconds(launch.launchBlockTimestamp);
        triggerBuyerWallet = match.walletAddress;
        triggerAgeSeconds = buyerAgeSeconds(
          timestampToUnixSeconds(match.firstBuyBlockTimestamp),
          launchUnix,
        );
      } else if (continuationBuyer2) {
        // Fall back display only if tx matches known cont2
        if (
          continuationBuyer2.txHash.toLowerCase() ===
          event.triggerTxHash.toLowerCase()
        ) {
          triggerBuyerWallet = continuationBuyer2.walletAddress;
          triggerAgeSeconds = continuationBuyer2.ageSeconds;
        }
      }
    }

    const evidence = evaluateCohortEvidence({
      launchBlockNumber: launch.launchBlockNumber,
      observationStartBlock: input.observationStartBlock,
      earlyBuyers,
      continuationBuyer1,
      continuationBuyer2,
      triggerTxHash: event.triggerTxHash,
    });

    members.push({
      position: members.length + 1,
      targetSize,
      tokenAddress: launch.tokenAddress,
      marketAddress: launch.marketAddress,
      factoryAddress: launch.factoryAddress,
      factoryVersion: launch.factoryVersion,
      launchBlockNumber: launch.launchBlockNumber,
      launchTimestampIso: launch.launchBlockTimestamp,
      launchTxHash: launch.launchTxHash,
      earlyBuyers,
      continuationBuyer1,
      continuationBuyer2,
      eventId: event.id,
      eventBlockNumber: event.triggerBlockNumber,
      eventTimestampIso: event.occurredAt,
      triggerTxHash: event.triggerTxHash,
      triggerBuyerWallet,
      triggerAgeSeconds,
      evidenceCheck: evidence.evidenceCheck,
      evidenceReasons: evidence.evidenceReasons,
    });
  }

  return {
    observationStartBlock: input.observationStartBlock,
    qualifyingCount: members.length,
    targetSize,
    members,
  };
}

export function formatCohortReportLines(
  report: CohortReport,
  chainId: number,
): string[] {
  const lines: string[] = [
    "PONS CONTINUATION VALIDATION COHORT — READ ONLY",
    `chain_id=${chainId}`,
    `observation_start_block=${report.observationStartBlock}`,
    `qualifying_events=${report.qualifyingCount}/${report.targetSize}`,
  ];

  for (const m of report.members) {
    lines.push("");
    lines.push(`[${m.position}/${m.targetSize}]`);
    lines.push(`token=${m.tokenAddress}`);
    lines.push(`market=${m.marketAddress}`);
    lines.push(`factory=${m.factoryAddress}`);
    lines.push(`version=${m.factoryVersion}`);
    lines.push(`launch_block=${m.launchBlockNumber}`);
    lines.push(`launch_timestamp=${m.launchTimestampIso}`);
    lines.push(`launch_tx=${m.launchTxHash}`);
    lines.push(`early_first_buyers=${m.earlyBuyers.length}`);
    m.earlyBuyers.forEach((b, i) => {
      lines.push(`early_buyer[${i + 1}].wallet=${b.walletAddress}`);
      lines.push(`early_buyer[${i + 1}].tx=${b.txHash}`);
      lines.push(`early_buyer[${i + 1}].block=${b.blockNumber}`);
      lines.push(`early_buyer[${i + 1}].timestamp=${b.timestampIso}`);
      lines.push(`early_buyer[${i + 1}].age_seconds=${b.ageSeconds}`);
    });

    const c1 = m.continuationBuyer1;
    if (c1) {
      lines.push(`continuation_buyer_1.wallet=${c1.walletAddress}`);
      lines.push(`continuation_buyer_1.tx=${c1.txHash}`);
      lines.push(`continuation_buyer_1.block=${c1.blockNumber}`);
      lines.push(`continuation_buyer_1.timestamp=${c1.timestampIso}`);
      lines.push(`continuation_buyer_1.age_seconds=${c1.ageSeconds}`);
    } else {
      lines.push("continuation_buyer_1=unavailable");
    }

    const c2 = m.continuationBuyer2;
    if (c2) {
      lines.push(`continuation_buyer_2.wallet=${c2.walletAddress}`);
      lines.push(`continuation_buyer_2.tx=${c2.txHash}`);
      lines.push(`continuation_buyer_2.block=${c2.blockNumber}`);
      lines.push(`continuation_buyer_2.timestamp=${c2.timestampIso}`);
      lines.push(`continuation_buyer_2.age_seconds=${c2.ageSeconds}`);
    } else {
      lines.push("continuation_buyer_2=unavailable");
    }

    lines.push(`event_id=${m.eventId}`);
    lines.push(`event_block=${m.eventBlockNumber}`);
    lines.push(`event_timestamp=${m.eventTimestampIso}`);
    lines.push(`trigger_buyer=${m.triggerBuyerWallet ?? "unavailable"}`);
    lines.push(`trigger_tx=${m.triggerTxHash ?? "unavailable"}`);
    lines.push(
      `trigger_age_seconds=${m.triggerAgeSeconds ?? "unavailable"}`,
    );
    lines.push(`evidence_check=${m.evidenceCheck}`);
    if (m.evidenceReasons.length > 0) {
      for (const r of m.evidenceReasons) {
        lines.push(`evidence_reason=${r}`);
      }
    }
    lines.push("status=READY_FOR_MANUAL_REVIEW");
  }

  lines.push("");
  lines.push(
    `cohort_progress=${report.qualifyingCount}/${report.targetSize}`,
  );
  lines.push("NO CHANGES APPLIED");
  return lines;
}
