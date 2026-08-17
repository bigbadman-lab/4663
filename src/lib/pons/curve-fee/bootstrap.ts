/**
 * Operator-safe PONS V2 fee cursor origin. Live-forward observation.
 * Does not touch PONS factories/transfers and does not consult production_state.
 */

export function ponsV2FeeBootstrapLastProcessedBlock(fromBlock: number): number {
  if (!Number.isInteger(fromBlock) || fromBlock < 0) {
    throw new Error("fromBlock must be a non-negative integer");
  }
  return Math.max(0, fromBlock - 1);
}

export type PonsV2FeeBootstrapCliArgs = {
  fromBlock: number | null;
  lookback: number | null;
  force: boolean;
};

export type PonsV2FeeBootstrapOrigin = {
  lastProcessedBlock: number;
  nextScanFromBlock: number;
  reason: string;
};

export function parsePonsV2FeeBootstrapArgs(
  argv: string[],
): PonsV2FeeBootstrapCliArgs {
  let fromBlock: number | null = null;
  let lookback: number | null = null;
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") {
      force = true;
      continue;
    }
    if (a === "--from-block") {
      const v = Number(argv[++i]);
      if (!Number.isInteger(v) || v < 0) {
        throw new Error("--from-block requires a non-negative integer");
      }
      fromBlock = v;
      continue;
    }
    if (a === "--lookback") {
      const v = Number(argv[++i]);
      if (!Number.isInteger(v) || v <= 0) {
        throw new Error("--lookback requires a positive integer");
      }
      lookback = v;
      continue;
    }
  }

  if (fromBlock !== null && lookback !== null) {
    throw new Error("use only one of --from-block or --lookback");
  }

  return { fromBlock, lookback, force };
}

/**
 * Default: last_processed_block = head (next scan at head + 1).
 * --from-block n: next scan begins at n (cursor = n - 1).
 * --lookback k: next scan covers the last k blocks through head.
 */
export function resolvePonsV2FeeBootstrapOrigin(input: {
  head: number;
  fromBlock?: number | null;
  lookback?: number | null;
}): PonsV2FeeBootstrapOrigin {
  const head = input.head;
  if (!Number.isInteger(head) || head < 0) {
    throw new Error("head must be a non-negative integer");
  }

  if (input.fromBlock != null && input.lookback != null) {
    throw new Error("use only one of --from-block or --lookback");
  }

  if (input.fromBlock != null) {
    const fromBlock = input.fromBlock;
    if (!Number.isInteger(fromBlock) || fromBlock < 0) {
      throw new Error("--from-block requires a non-negative integer");
    }
    if (fromBlock > head + 1) {
      throw new Error(
        `start block ${fromBlock} is beyond head ${head}; refused`,
      );
    }
    return {
      lastProcessedBlock: ponsV2FeeBootstrapLastProcessedBlock(fromBlock),
      nextScanFromBlock: fromBlock,
      reason: "--from-block",
    };
  }

  if (input.lookback != null) {
    const lookback = input.lookback;
    if (!Number.isInteger(lookback) || lookback <= 0) {
      throw new Error("--lookback requires a positive integer");
    }
    const startBlock = Math.max(0, head - lookback + 1);
    return {
      lastProcessedBlock: ponsV2FeeBootstrapLastProcessedBlock(startBlock),
      nextScanFromBlock: startBlock,
      reason: `--lookback ${lookback}`,
    };
  }

  return {
    lastProcessedBlock: head,
    nextScanFromBlock: head + 1,
    reason: "chain head (forward only)",
  };
}
