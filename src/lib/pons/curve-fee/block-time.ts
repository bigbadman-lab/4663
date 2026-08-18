/**
 * Resolve a historical block from chain timestamps.
 * Does not assume a fixed blocks-per-hour rate.
 */

export type BlockTimePoint = {
  number: number;
  timestamp: number;
};

export type BlockTimeLookup = {
  getBlock(blockNumber: number): Promise<BlockTimePoint>;
};

function requireBlockNumber(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`[pons-v2-fees] ${field} must be a non-negative integer`);
  }
  return value;
}

function requireUnix(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`[pons-v2-fees] ${field} must be a non-negative unix timestamp`);
  }
  return value;
}

/**
 * Smallest block whose timestamp is >= targetUnix, clamped to [0, head].
 * If every block is still before the target, returns head.
 */
export async function findBlockAtOrAfterUnix(
  lookup: BlockTimeLookup,
  head: number,
  targetUnix: number,
): Promise<BlockTimePoint> {
  const headNumber = requireBlockNumber(head, "head");
  const target = requireUnix(targetUnix, "targetUnix");

  const headBlock = await lookup.getBlock(headNumber);
  if (headBlock.timestamp <= target) {
    return headBlock;
  }

  let lo = 0;
  let hi = headNumber;
  let genesis: BlockTimePoint | null = null;
  try {
    genesis = await lookup.getBlock(0);
  } catch {
    lo = 1;
    genesis = await lookup.getBlock(1);
  }
  if (genesis.timestamp >= target) {
    return genesis;
  }

  let best = headBlock;
  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    const block = await lookup.getBlock(mid);
    if (block.timestamp >= target) {
      best = block;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return best;
}

export async function findBlockForLookbackHours(
  lookup: BlockTimeLookup,
  head: number,
  hours: number,
): Promise<{
  headBlock: BlockTimePoint;
  targetUnix: number;
  startBlock: BlockTimePoint;
}> {
  if (!Number.isInteger(hours) || hours <= 0) {
    throw new Error("[pons-v2-fees] lookback hours must be a positive integer");
  }
  const headNumber = requireBlockNumber(head, "head");
  const headBlock = await lookup.getBlock(headNumber);
  const targetUnix = Math.max(0, headBlock.timestamp - hours * 3600);
  const startBlock = await findBlockAtOrAfterUnix(lookup, headNumber, targetUnix);
  return { headBlock, targetUnix, startBlock };
}
