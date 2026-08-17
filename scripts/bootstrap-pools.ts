/**
 * Operator bootstrap for POOLS Instant cursors only.
 *
 * Sets `pools_instant` and `pools_swaps` to the same last_processed_block so
 * the next normal scan begins at fromBlock (cursor = fromBlock - 1).
 * Instant discovery still runs first; the worker refuses to advance swaps
 * through a range Instant has not caught up to.
 *
 * Does NOT touch pons_factories or pons_transfers.
 * Safe after production cutover (unlike factory/transfer bootstrap).
 * Does NOT scan from genesis.
 *
 * Recommended start: observation_start_block X when set, else
 * production_start_block + 1. Reuses the existing forward-watch boundary so
 * POOLS RADAR matches the same production/observation window as PONS.
 *
 * Usage:
 *   npm run worker:bootstrap-pools -- --from-boundary
 *   npm run worker:bootstrap-pools -- --from-block 34002667
 *   npm run worker:bootstrap-pools -- --lookback 500
 *   npm run worker:bootstrap-pools -- --from-boundary --force
 *
 * Equivalent SQL (idempotent; do not run if you need to overwrite):
 *   insert into public.chain_cursors (stream_name, chain_id, last_processed_block)
 *   values
 *     ('pools_instant', 4663, :from_block - 1),
 *     ('pools_swaps', 4663, :from_block - 1)
 *   on conflict (stream_name, chain_id) do nothing;
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadDotenv({ path: resolve(process.cwd(), ".env"), quiet: true });

import {
  CURSOR_STREAM_POOLS_INSTANT,
  CURSOR_STREAM_POOLS_SWAPS,
} from "@/lib/pools/constants";
import { loadWorkerConfig } from "@/lib/worker/config";
import { createChainRpc } from "@/lib/worker/chain/rpc";
import { workerError, workerLog } from "@/lib/worker/log";
import {
  poolsBootstrapLastProcessedBlock,
  recommendedPoolsStartBlock,
} from "@/lib/worker/pools/bootstrap";
import {
  loadCursor,
  upsertCursor,
} from "@/lib/worker/repositories/cursors";
import { loadProductionState } from "@/lib/worker/repositories/production-state";
import {
  createWorkerSupabase,
  proveSupabaseConnectivity,
} from "@/lib/worker/supabase";

function parseArgs(argv: string[]): {
  fromBlock: number | null;
  lookback: number | null;
  fromBoundary: boolean;
  force: boolean;
} {
  let fromBlock: number | null = null;
  let lookback: number | null = null;
  let fromBoundary = false;
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") {
      force = true;
      continue;
    }
    if (a === "--from-boundary") {
      fromBoundary = true;
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

  const selected = [
    fromBlock !== null,
    lookback !== null,
    fromBoundary,
  ].filter(Boolean).length;
  if (selected > 1) {
    throw new Error(
      "use only one of --from-block, --lookback, or --from-boundary",
    );
  }
  if (selected === 0) {
    throw new Error(
      "require --from-boundary, --from-block <n>, or --lookback <blocks> (will not default to genesis)",
    );
  }

  return { fromBlock, lookback, fromBoundary, force };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadWorkerConfig();
  const supabase = createWorkerSupabase(config);
  await proveSupabaseConnectivity(supabase);

  const production = await loadProductionState(supabase, config.chainId);
  const rpc = createChainRpc(config.alchemyRpcUrl);
  const head = await rpc.getBlockNumber();
  workerLog(`chain head: ${head}`);

  let startBlock: number;
  let reason: string;
  if (args.fromBoundary) {
    if (!production) {
      throw new Error(
        "refused: --from-boundary requires production_state (observation X or production B)",
      );
    }
    const recommended = recommendedPoolsStartBlock({
      observationStartBlock: production.observationStartBlock,
      productionStartBlock: production.productionStartBlock,
    });
    startBlock = recommended.fromBlock;
    reason = recommended.reason;
  } else if (args.fromBlock !== null) {
    startBlock = args.fromBlock;
    reason = "--from-block";
  } else {
    startBlock = Math.max(0, head - args.lookback! + 1);
    reason = `--lookback ${args.lookback}`;
  }

  if (startBlock > head + 1) {
    throw new Error(
      `start block ${startBlock} is beyond head ${head}; refused`,
    );
  }

  const lastProcessedBlock = poolsBootstrapLastProcessedBlock(startBlock);

  const [instant, swaps] = await Promise.all([
    loadCursor(supabase, CURSOR_STREAM_POOLS_INSTANT, config.chainId),
    loadCursor(supabase, CURSOR_STREAM_POOLS_SWAPS, config.chainId),
  ]);

  const alreadyAtTarget =
    instant?.lastProcessedBlock === lastProcessedBlock &&
    swaps?.lastProcessedBlock === lastProcessedBlock;

  if (alreadyAtTarget && !args.force) {
    workerLog(
      `POOLS cursors already at last_processed_block=${lastProcessedBlock} (start=${startBlock}, ${reason})`,
    );
    workerLog("idempotent no-op; re-run with --force to rewrite");
    return;
  }

  if ((instant || swaps) && !args.force) {
    workerLog(
      `pools_instant=${instant?.lastProcessedBlock ?? "missing"} pools_swaps=${swaps?.lastProcessedBlock ?? "missing"}`,
    );
    workerLog("re-run with --force to overwrite POOLS cursors only");
    process.exit(2);
  }

  const instantRow = await upsertCursor(supabase, {
    streamName: CURSOR_STREAM_POOLS_INSTANT,
    chainId: config.chainId,
    lastProcessedBlock,
  });
  const swapsRow = await upsertCursor(supabase, {
    streamName: CURSOR_STREAM_POOLS_SWAPS,
    chainId: config.chainId,
    lastProcessedBlock,
  });

  workerLog(
    `bootstrapped ${CURSOR_STREAM_POOLS_INSTANT}: last_processed_block=${instantRow.lastProcessedBlock}`,
  );
  workerLog(
    `bootstrapped ${CURSOR_STREAM_POOLS_SWAPS}: last_processed_block=${swapsRow.lastProcessedBlock}`,
  );
  workerLog(
    `next Instant scan begins at ${instantRow.lastProcessedBlock + 1} (${reason})`,
  );
  workerLog(
    "PONS cursors were not read or written. Instant must catch up before swaps advance through the same range.",
  );
}

main().catch((err: unknown) => {
  workerError("bootstrap-pools failed", err);
  process.exit(1);
});
