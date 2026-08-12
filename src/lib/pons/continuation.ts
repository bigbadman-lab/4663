/**
 * Stage 11B — Candidate B (pons_buyer_continuation) pure helpers.
 * Chain-time integer ages only. No I/O.
 */

/** Exclusive end of pre-3m bucket (buyer age < this). */
export const CONTINUATION_PRE_END_SECONDS = 180 as const;

/** Exclusive end of continuation bucket (buyer age < this). */
export const CONTINUATION_WINDOW_END_SECONDS = 300 as const;

/** Inclusive start of continuation bucket. */
export const CONTINUATION_WINDOW_START_SECONDS = 180 as const;

export type BuyerAgeBucket = "pre" | "continuation" | "too_late";

export function buyerAgeSeconds(
  firstBuyUnix: number,
  launchUnix: number,
): number {
  return Math.floor(firstBuyUnix - launchUnix);
}

export function buyerAgeBucket(ageSeconds: number): BuyerAgeBucket {
  if (ageSeconds < CONTINUATION_PRE_END_SECONDS) return "pre";
  if (ageSeconds < CONTINUATION_WINDOW_END_SECONDS) return "continuation";
  return "too_late";
}

export type ContinuationBucketCounts = {
  pre3m: number;
  continuation: number;
  tooLate: number;
};

/**
 * Count distinct first-buy ages into Candidate B buckets.
 * Input timestamps are first-buy unix seconds (one entry per wallet).
 */
export function countContinuationBuckets(
  firstBuyUnixTimestamps: readonly number[],
  launchUnix: number,
): ContinuationBucketCounts {
  let pre3m = 0;
  let continuation = 0;
  let tooLate = 0;
  for (const ts of firstBuyUnixTimestamps) {
    const age = buyerAgeSeconds(ts, launchUnix);
    const bucket = buyerAgeBucket(age);
    if (bucket === "pre") pre3m += 1;
    else if (bucket === "continuation") continuation += 1;
    else tooLate += 1;
  }
  return { pre3m, continuation, tooLate };
}

export function isContinuationRuleSatisfied(
  counts: ContinuationBucketCounts,
): boolean {
  return counts.pre3m >= 1 && counts.continuation >= 2;
}

/** Token still eligible for continuation observation at chain time T. */
export function isWithinContinuationWatch(
  evaluationUnix: number,
  launchUnix: number,
): boolean {
  return evaluationUnix - launchUnix < CONTINUATION_WINDOW_END_SECONDS;
}

/**
 * Among first-buy unix times in the continuation bucket, return the 2nd
 * (0-based index 1) ascending — the fire-qualifying buy time — or null.
 */
export function secondContinuationBuyUnix(
  firstBuyUnixTimestamps: readonly number[],
  launchUnix: number,
): number | null {
  const cont = firstBuyUnixTimestamps
    .filter((ts) => buyerAgeBucket(buyerAgeSeconds(ts, launchUnix)) === "continuation")
    .sort((a, b) => a - b);
  return cont.length >= 2 ? cont[1]! : null;
}
