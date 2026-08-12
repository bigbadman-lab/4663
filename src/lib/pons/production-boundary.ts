/**
 * Production cutover + forward-observation boundary helpers.
 *
 * production_start_block B: immutable provenance; legacy watch = launch > B
 * observation_start_block X: when set, forward watch = launch >= X
 */

export const PRODUCTION_CUTOVER_VERSION = "pons-live-v1" as const;

export type ProductionCutoverVersion = typeof PRODUCTION_CUTOVER_VERSION;

/**
 * Production launch eligibility after cutover at block B:
 *   launch_block_number > B
 *
 * Block B itself is the last pre-production processed boundary and is excluded.
 */
export function isProductionEligibleLaunchBlock(
  launchBlockNumber: number,
  productionStartBlock: number,
): boolean {
  return launchBlockNumber > productionStartBlock;
}

/**
 * Forward-observation eligibility when observation_start_block = X:
 *   launch_block_number >= X
 */
export function isObservationEligibleLaunchBlock(
  launchBlockNumber: number,
  observationStartBlock: number,
): boolean {
  return launchBlockNumber >= observationStartBlock;
}

/** Worker/watch boundary: production B plus optional observation X. */
export type ForwardWatchBoundary = {
  productionStartBlock: number;
  /** null / omitted → legacy production-only eligibility */
  observationStartBlock?: number | null;
};

/**
 * Canonical worker/watch eligibility.
 *
 * if observationStartBlock != null:
 *   launch >= observationStartBlock
 * else:
 *   launch > productionStartBlock
 */
export function isForwardWatchEligibleLaunchBlock(
  launchBlockNumber: number,
  boundary: ForwardWatchBoundary,
): boolean {
  const x = boundary.observationStartBlock;
  if (x !== null && x !== undefined) {
    return isObservationEligibleLaunchBlock(launchBlockNumber, x);
  }
  return isProductionEligibleLaunchBlock(
    launchBlockNumber,
    boundary.productionStartBlock,
  );
}

/** Filter ACTIVE launch rows for production RAM / transfer watch. */
export function filterProductionEligibleLaunches<
  T extends { launchBlockNumber: number },
>(launches: readonly T[], productionStartBlock: number): T[] {
  return launches.filter((l) =>
    isProductionEligibleLaunchBlock(l.launchBlockNumber, productionStartBlock),
  );
}

/** Filter launches for forward-watch RAM (respects optional observation X). */
export function filterForwardWatchEligibleLaunches<
  T extends { launchBlockNumber: number },
>(launches: readonly T[], boundary: ForwardWatchBoundary): T[] {
  return launches.filter((l) =>
    isForwardWatchEligibleLaunchBlock(l.launchBlockNumber, boundary),
  );
}
