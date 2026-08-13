/**
 * Stage 8A.7 — read-only Candidate B integrity checks for Summon history.
 * Reconstructs frozen continuation rule from launches + first buyers.
 * No I/O. No mutation.
 */

import {
  buyerAgeBucket,
  buyerAgeSeconds,
  countContinuationBuckets,
  isContinuationRuleSatisfied,
  secondContinuationBuyUnix,
} from "@/lib/pons/continuation";

export type SummonIntegrityBuyerInput = {
  firstBuyBlockTimestamp: string;
  firstBuyTxHash?: string | null;
};

export type SummonIntegrityEventInput = {
  id: string;
  tokenAddress: string;
  occurredAt: string;
  triggerTxHash?: string | null;
};

export type SummonIntegrityLaunchInput = {
  tokenAddress: string;
  launchBlockNumber: number;
  launchBlockTimestamp: string;
};

export type SummonIntegrityReport = {
  eventId: string;
  tokenAddress: string;
  launchTimestampIso: string | null;
  pre180Count: number;
  continuationWindowCount: number;
  secondContinuationBuyerAt: string | null;
  storedOccurredAt: string;
  status: "PASS" | "FAIL";
  reasons: string[];
};

function unixFromIso(value: string): number | null {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

/**
 * Launch eligible for public Summon history.
 * Matches live production gate (launch > productionStart) and excludes
 * pre-observation launches when observation is active.
 */
export function isSummonEligibleLaunchBlock(
  launchBlockNumber: number,
  productionStartBlock: bigint | number,
  observationStartBlock: number | null,
): boolean {
  const prod =
    typeof productionStartBlock === "bigint"
      ? productionStartBlock
      : BigInt(productionStartBlock);
  if (!(BigInt(launchBlockNumber) > prod)) return false;
  if (
    observationStartBlock !== null &&
    launchBlockNumber < observationStartBlock
  ) {
    return false;
  }
  return true;
}

/**
 * Verify a stored pons_buyer_continuation row against the frozen Candidate B rule.
 */
export function verifyContinuationEventIntegrity(input: {
  event: SummonIntegrityEventInput;
  launch: SummonIntegrityLaunchInput | null;
  buyers: readonly SummonIntegrityBuyerInput[];
  productionStartBlock: bigint | number;
  observationStartBlock: number | null;
}): SummonIntegrityReport {
  const reasons: string[] = [];
  const tokenAddress = input.event.tokenAddress.trim().toLowerCase();
  const storedOccurredAt = input.event.occurredAt;

  if (!input.launch) {
    return {
      eventId: input.event.id,
      tokenAddress,
      launchTimestampIso: null,
      pre180Count: 0,
      continuationWindowCount: 0,
      secondContinuationBuyerAt: null,
      storedOccurredAt,
      status: "FAIL",
      reasons: ["missing pons_launches row"],
    };
  }

  if (
    !isSummonEligibleLaunchBlock(
      input.launch.launchBlockNumber,
      input.productionStartBlock,
      input.observationStartBlock,
    )
  ) {
    reasons.push(
      `launch_block ${input.launch.launchBlockNumber} outside production/observation boundary`,
    );
  }

  const launchUnix = unixFromIso(input.launch.launchBlockTimestamp);
  if (launchUnix === null) {
    reasons.push("invalid launch_block_timestamp");
    return {
      eventId: input.event.id,
      tokenAddress,
      launchTimestampIso: input.launch.launchBlockTimestamp,
      pre180Count: 0,
      continuationWindowCount: 0,
      secondContinuationBuyerAt: null,
      storedOccurredAt,
      status: "FAIL",
      reasons,
    };
  }

  const buyUnixes: number[] = [];
  for (const buyer of input.buyers) {
    const u = unixFromIso(buyer.firstBuyBlockTimestamp);
    if (u === null) {
      reasons.push("invalid first_buy_block_timestamp");
      continue;
    }
    buyUnixes.push(u);
  }

  const counts = countContinuationBuckets(buyUnixes, launchUnix);
  if (!isContinuationRuleSatisfied(counts)) {
    reasons.push(
      `Candidate B not satisfied (pre=${counts.pre3m} cont=${counts.continuation})`,
    );
  }

  const secondUnix = secondContinuationBuyUnix(buyUnixes, launchUnix);
  const secondContinuationBuyerAt =
    secondUnix === null ? null : new Date(secondUnix * 1000).toISOString();

  const occurredUnix = unixFromIso(storedOccurredAt);
  if (occurredUnix === null) {
    reasons.push("invalid stored occurred_at");
  } else if (secondUnix === null) {
    reasons.push("missing second continuation buyer for occurred_at check");
  } else if (occurredUnix !== secondUnix) {
    reasons.push(
      `occurred_at unix ${occurredUnix} != second continuation buyer unix ${secondUnix}`,
    );
  }

  if (input.event.triggerTxHash) {
    const trigger = input.event.triggerTxHash.trim().toLowerCase();
    const orderedCont = input.buyers
      .map((b) => ({
        ts: unixFromIso(b.firstBuyBlockTimestamp),
        tx: (b.firstBuyTxHash ?? "").trim().toLowerCase(),
      }))
      .filter((b) => {
        if (b.ts === null) return false;
        return (
          buyerAgeBucket(buyerAgeSeconds(b.ts, launchUnix)) === "continuation"
        );
      })
      .sort((a, b) => (a.ts! - b.ts!) || a.tx.localeCompare(b.tx));
    const second = orderedCont[1];
    if (!second || !second.tx) {
      reasons.push("cannot match trigger_tx_hash to second continuation buyer");
    } else if (second.tx !== trigger) {
      reasons.push(
        `trigger_tx ${trigger} != second continuation buyer tx ${second.tx}`,
      );
    }
  }

  return {
    eventId: input.event.id,
    tokenAddress,
    launchTimestampIso: input.launch.launchBlockTimestamp,
    pre180Count: counts.pre3m,
    continuationWindowCount: counts.continuation,
    secondContinuationBuyerAt,
    storedOccurredAt,
    status: reasons.length === 0 ? "PASS" : "FAIL",
    reasons,
  };
}
