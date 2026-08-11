/**
 * Operator bootstrap for pons_factories cursor.
 *
 * Does NOT scan the whole history. Sets last_processed_block so the next
 * normal scan begins at fromBlock (cursor = fromBlock - 1).
 *
 * Usage:
 *   npm run worker:bootstrap-factories -- --from-block 33500000
 *   npm run worker:bootstrap-factories -- --lookback 500
 *   npm run worker:bootstrap-factories -- --from-block 33500000 --force
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadDotenv({ path: resolve(process.cwd(), ".env"), quiet: true });

import { CURSOR_STREAM_PONS_FACTORIES } from "@/lib/pons/constants";
import { loadWorkerConfig } from "@/lib/worker/config";
import { createChainRpc } from "@/lib/worker/chain/rpc";
import { workerError, workerLog } from "@/lib/worker/log";
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
  force: boolean;
} {
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
    throw new Error("use either --from-block or --lookback, not both");
  }
  if (fromBlock === null && lookback === null) {
    throw new Error(
      "require --from-block <n> or --lookback <blocks> (will not default to genesis)",
    );
  }

  return { fromBlock, lookback, force };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadWorkerConfig();
  const supabase = createWorkerSupabase(config);
  await proveSupabaseConnectivity(supabase);

  const production = await loadProductionState(supabase, config.chainId);
  if (production) {
    throw new Error(
      `refused: production cutover already at B=${production.productionStartBlock}. Bootstrap cannot rewrite production cursors.`,
    );
  }

  const rpc = createChainRpc(config.alchemyRpcUrl);

  const head = await rpc.getBlockNumber();
  workerLog(`chain head: ${head}`);

  let startBlock: number;
  if (args.fromBlock !== null) {
    startBlock = args.fromBlock;
  } else {
    startBlock = Math.max(0, head - args.lookback! + 1);
  }

  if (startBlock > head + 1) {
    throw new Error(
      `start block ${startBlock} is beyond head ${head}; refused`,
    );
  }

  // cursor N means fully processed through N; next scan N+1 → set N = start-1
  const lastProcessedBlock = Math.max(0, startBlock - 1);

  const existing = await loadCursor(
    supabase,
    CURSOR_STREAM_PONS_FACTORIES,
    config.chainId,
  );

  if (existing && !args.force) {
    workerLog(
      `cursor pons_factories already exists at ${existing.lastProcessedBlock}`,
    );
    workerLog("re-run with --force to overwrite (operator action required)");
    process.exit(2);
  }

  const row = await upsertCursor(supabase, {
    streamName: CURSOR_STREAM_PONS_FACTORIES,
    chainId: config.chainId,
    lastProcessedBlock,
  });

  workerLog(
    `bootstrapped ${CURSOR_STREAM_PONS_FACTORIES}: last_processed_block=${row.lastProcessedBlock}`,
  );
  workerLog(
    `next normal scan begins at ${row.lastProcessedBlock + 1} (requested start=${startBlock})`,
  );
}

main().catch((err: unknown) => {
  workerError("bootstrap failed", err);
  process.exit(1);
});
