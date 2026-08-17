/**
 * Operator-safe POOLS cursor origin. Does not touch PONS streams.
 */

export function poolsBootstrapLastProcessedBlock(fromBlock: number): number {
  if (!Number.isInteger(fromBlock) || fromBlock < 0) {
    throw new Error("fromBlock must be a non-negative integer");
  }
  return Math.max(0, fromBlock - 1);
}

export type PoolsBootstrapBoundary = {
  observationStartBlock: number | null;
  productionStartBlock: number | null;
};

/**
 * Forward-watch origin for Instant discovery + swaps.
 * Observation X when set (launch >= X); else production B+1 (launch > B).
 * Never genesis.
 */
export function recommendedPoolsStartBlock(
  boundary: PoolsBootstrapBoundary,
): { fromBlock: number; reason: string } {
  if (
    boundary.observationStartBlock !== null &&
    Number.isInteger(boundary.observationStartBlock) &&
    boundary.observationStartBlock >= 0
  ) {
    return {
      fromBlock: boundary.observationStartBlock,
      reason: "observation_start_block (forward watch launch_block >= X)",
    };
  }
  if (
    boundary.productionStartBlock !== null &&
    Number.isInteger(boundary.productionStartBlock) &&
    boundary.productionStartBlock >= 0
  ) {
    return {
      fromBlock: boundary.productionStartBlock + 1,
      reason: "production_start_block + 1 (forward watch launch_block > B)",
    };
  }
  throw new Error(
    "refused: no observation_start_block or production_start_block — will not scan from genesis",
  );
}
