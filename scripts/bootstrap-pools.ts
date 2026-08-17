/**
 * Operator bootstrap for POOLS Instant cursors only.
 *
 * POOLS is live-forward monitoring. Default (no origin flags) sets both
 * `pools_instant` and `pools_swaps` to the current chain head so the next
 * normal scan begins at head + 1 (last_processed_block = head).
 *
 * Instant discovery still runs first; the worker refuses to advance swaps
 * through a range Instant has not caught up to.
 *
 * Does NOT touch pons_factories or pons_transfers.
 * Does NOT read production_state, observation_start_block, or
 * production_start_block. Does NOT scan from genesis.
 *
 * Usage:
 *   npm run worker:bootstrap-pools
 *   npm run worker:bootstrap-pools -- --lookback 500
 *   npm run worker:bootstrap-pools -- --from-block 38876472
 *   npm run worker:bootstrap-pools -- --force
 *
 * Equivalent SQL for the default (head) origin:
 *   insert into public.chain_cursors (stream_name, chain_id, last_processed_block)
 *   values
 *     ('pools_instant', 4663, :head),
 *     ('pools_swaps', 4663, :head)
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
  parsePoolsBootstrapArgs,
  resolvePoolsBootstrapOrigin,
} from "@/lib/worker/pools/bootstrap";
import {
  loadCursor,
  upsertCursor,
} from "@/lib/worker/repositories/cursors";
import {
  createWorkerSupabase,
  proveSupabaseConnectivity,
} from "@/lib/worker/supabase";

async function main(): Promise<void> {
  const args = parsePoolsBootstrapArgs(process.argv.slice(2));
  const config = loadWorkerConfig();
  const supabase = createWorkerSupabase(config);
  await proveSupabaseConnectivity(supabase);

  const rpc = createChainRpc(config.alchemyRpcUrl);
  const head = await rpc.getBlockNumber();
  workerLog(`chain head: ${head}`);

  const origin = resolvePoolsBootstrapOrigin({
    head,
    fromBlock: args.fromBlock,
    lookback: args.lookback,
  });
  const lastProcessedBlock = origin.lastProcessedBlock;

  const [instant, swaps] = await Promise.all([
    loadCursor(supabase, CURSOR_STREAM_POOLS_INSTANT, config.chainId),
    loadCursor(supabase, CURSOR_STREAM_POOLS_SWAPS, config.chainId),
  ]);

  const alreadyAtTarget =
    instant?.lastProcessedBlock === lastProcessedBlock &&
    swaps?.lastProcessedBlock === lastProcessedBlock;

  if (alreadyAtTarget && !args.force) {
    workerLog(
      `POOLS cursors already at last_processed_block=${lastProcessedBlock} (next=${origin.nextScanFromBlock}, ${origin.reason})`,
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
    `next Instant scan begins at ${instantRow.lastProcessedBlock + 1} (${origin.reason})`,
  );
  workerLog(
    "PONS cursors were not read or written. Instant must catch up before swaps advance through the same range.",
  );
}

main().catch((err: unknown) => {
  workerError("bootstrap-pools failed", err);
  process.exit(1);
});
