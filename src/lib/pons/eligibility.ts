/**
 * Pure chain-time eligibility helpers for the Stage 2 contract.
 * No I/O. Deterministic given timestamps in unix seconds (UTC chain time).
 */

import {
  EVENT_AGE_FLOOR_SECONDS,
  EVENT_NEW_BUYERS_THRESHOLD,
  EVENT_WINDOW_SECONDS,
  STARTUP_REWIND_BLOCKS,
  TOKEN_WATCH_TTL_SECONDS,
} from "@/lib/pons/constants";
import type { ChainUnixSeconds, FireEligibilityInput } from "@/lib/pons/types";

/** Token age in whole seconds (chain): current chain ts minus launch ts. */
export function tokenAgeSeconds(
  chainTimestamp: ChainUnixSeconds,
  launchTimestamp: ChainUnixSeconds,
): number {
  return chainTimestamp - launchTimestamp;
}

/**
 * Inclusive window: keep first buys with
 * chainTimestamp - windowSeconds <= t <= chainTimestamp
 * (equivalently drop t < chainTimestamp - windowSeconds).
 */
export function isInsideInclusiveWindow(
  firstBuyTimestamp: ChainUnixSeconds,
  chainTimestamp: ChainUnixSeconds,
  windowSeconds: number = EVENT_WINDOW_SECONDS,
): boolean {
  return firstBuyTimestamp >= chainTimestamp - windowSeconds;
}

export function countInsideInclusiveWindow(
  firstBuyTimestamps: ChainUnixSeconds[],
  chainTimestamp: ChainUnixSeconds,
  windowSeconds: number = EVENT_WINDOW_SECONDS,
): number {
  return firstBuyTimestamps.filter((t) =>
    isInsideInclusiveWindow(t, chainTimestamp, windowSeconds),
  ).length;
}

/**
 * Activity is valid through the inclusive watch boundary:
 * chain_ts <= launch_ts + TTL  (age <= TOKEN_WATCH_TTL_SECONDS).
 */
export function isWithinWatchLifetime(
  chainTimestamp: ChainUnixSeconds,
  launchTimestamp: ChainUnixSeconds,
  watchTtlSeconds: number = TOKEN_WATCH_TTL_SECONDS,
): boolean {
  return tokenAgeSeconds(chainTimestamp, launchTimestamp) <= watchTtlSeconds;
}

/**
 * After processing activity through the boundary, age >= TTL marks
 * the token as past/at end of watch (then fire-if-qualified, else expire).
 */
export function hasReachedWatchEnd(
  chainTimestamp: ChainUnixSeconds,
  launchTimestamp: ChainUnixSeconds,
  watchTtlSeconds: number = TOKEN_WATCH_TTL_SECONDS,
): boolean {
  return tokenAgeSeconds(chainTimestamp, launchTimestamp) >= watchTtlSeconds;
}

/**
 * Pure fire qualification (does not persist).
 * Requires age floor, chain time still within inclusive watch TTL,
 * and rolling unique-first count ≥ threshold.
 * Call only with timestamps of already-confirmed first buyers.
 */
export function isFireEligible(input: FireEligibilityInput): boolean {
  const age = tokenAgeSeconds(input.chainTimestamp, input.launchTimestamp);
  if (age < input.ageFloorSeconds) return false;
  // Inclusive boundary: fire allowed at age == TTL, then expire if still active.
  if (age > input.watchTtlSeconds) return false;

  const count = countInsideInclusiveWindow(
    input.rollingFirstBuyerTimestamps,
    input.chainTimestamp,
    input.windowSeconds,
  );
  return count >= input.threshold;
}

export function defaultFireEligibility(
  launchTimestamp: ChainUnixSeconds,
  chainTimestamp: ChainUnixSeconds,
  rollingFirstBuyerTimestamps: ChainUnixSeconds[],
): boolean {
  return isFireEligible({
    launchTimestamp,
    chainTimestamp,
    rollingFirstBuyerTimestamps,
    ageFloorSeconds: EVENT_AGE_FLOOR_SECONDS,
    windowSeconds: EVENT_WINDOW_SECONDS,
    threshold: EVENT_NEW_BUYERS_THRESHOLD,
    watchTtlSeconds: TOKEN_WATCH_TTL_SECONDS,
  });
}

/**
 * Steady-state exclusive resume is last_processed_block + 1.
 * On startup only: max(0, last_processed_block - STARTUP_REWIND_BLOCKS).
 */
export function startupResumeBlock(lastProcessedBlock: number): number {
  return Math.max(0, lastProcessedBlock - STARTUP_REWIND_BLOCKS);
}

export function steadyStateFromBlock(lastProcessedBlock: number): number {
  return lastProcessedBlock + 1;
}
