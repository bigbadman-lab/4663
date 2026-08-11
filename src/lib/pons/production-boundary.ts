/**
 * Production boundary: launches AFTER cutover block B enter product watch.
 * Cursor last_processed = B means next exclusive start is B+1.
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

/** Filter ACTIVE launch rows for production RAM / transfer watch. */
export function filterProductionEligibleLaunches<
  T extends { launchBlockNumber: number },
>(launches: readonly T[], productionStartBlock: number): T[] {
  return launches.filter((l) =>
    isProductionEligibleLaunchBlock(l.launchBlockNumber, productionStartBlock),
  );
}
