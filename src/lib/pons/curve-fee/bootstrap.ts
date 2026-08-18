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
  lookbackHours: number | null;
  fromHead: boolean;
  force: boolean;
};

export type PonsV2FeeBootstrapOrigin = {
  lastProcessedBlock: number;
  nextScanFromBlock: number;
  reason: string;
};

export const PONS_V2_FEE_BOOTSTRAP_ORIGIN_REQUIRED =
  "required origin: --lookback-hours 24 | --from-block N | --lookback N | --from-head" as const;

export function parsePonsV2FeeBootstrapArgs(
  argv: string[],
): PonsV2FeeBootstrapCliArgs {
  let fromBlock: number | null = null;
  let lookback: number | null = null;
  let lookbackHours: number | null = null;
  let fromHead = false;
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") {
      force = true;
      continue;
    }
    if (a === "--from-head") {
      fromHead = true;
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
    if (a === "--lookback-hours") {
      const v = Number(argv[++i]);
      if (!Number.isInteger(v) || v <= 0) {
        throw new Error("--lookback-hours requires a positive integer");
      }
      lookbackHours = v;
      continue;
    }
  }

  const originCount = [
    fromBlock !== null,
    lookback !== null,
    lookbackHours !== null,
    fromHead,
  ].filter(Boolean).length;
  if (originCount === 0) {
    throw new Error(PONS_V2_FEE_BOOTSTRAP_ORIGIN_REQUIRED);
  }
  if (originCount > 1) {
    throw new Error(
      "use only one of --lookback-hours, --from-block, --lookback, or --from-head",
    );
  }

  return { fromBlock, lookback, lookbackHours, fromHead, force };
}

/**
 * --from-head: last_processed_block = head (next scan at head + 1).
 * --from-block n: next scan begins at n (cursor = n - 1).
 * --lookback k: next scan covers the last k blocks through head.
 * --lookback-hours is resolved via chain timestamps in the bootstrap script.
 */
export function resolvePonsV2FeeBootstrapOrigin(input: {
  head: number;
  fromBlock?: number | null;
  lookback?: number | null;
  fromHead?: boolean;
}): PonsV2FeeBootstrapOrigin {
  const head = input.head;
  if (!Number.isInteger(head) || head < 0) {
    throw new Error("head must be a non-negative integer");
  }

  const originCount = [
    input.fromBlock != null,
    input.lookback != null,
    input.fromHead === true,
  ].filter(Boolean).length;
  if (originCount === 0) {
    throw new Error(PONS_V2_FEE_BOOTSTRAP_ORIGIN_REQUIRED);
  }
  if (originCount > 1) {
    throw new Error("use only one of --from-block, --lookback, or --from-head");
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
    reason: "--from-head",
  };
}
