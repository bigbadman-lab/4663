/**
 * Operator bootstrap for the PONS V2 Global Fees Paid cursor only.
 *
 * Default (no origin flags) sets `pons_v2_curve_fees` to the current chain
 * head so the next normal scan begins at head + 1.
 *
 * Does NOT touch pons_factories, pons_transfers, or POOLS cursors.
 * Does NOT read production_state. Does NOT scan from genesis.
 *
 * Usage:
 *   npm run worker:bootstrap-pons-v2-fees
 *   npm run worker:bootstrap-pons-v2-fees -- --from-block 33486660
 *   npm run worker:bootstrap-pons-v2-fees -- --lookback 500
 *   npm run worker:bootstrap-pons-v2-fees -- --force
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadDotenv({ path: resolve(process.cwd(), ".env"), quiet: true });

import { CURSOR_STREAM_PONS_V2_CURVE_FEES } from "@/lib/pons/curve-fee/constants";
import {
  parsePonsV2FeeBootstrapArgs,
  resolvePonsV2FeeBootstrapOrigin,
} from "@/lib/pons/curve-fee/bootstrap";
import { loadWorkerConfig } from "@/lib/worker/config";
import { createChainRpc } from "@/lib/worker/chain/rpc";
import { workerError, workerLog } from "@/lib/worker/log";
import {
  loadCursor,
  upsertCursor,
} from "@/lib/worker/repositories/cursors";
import {
  createWorkerSupabase,
  proveSupabaseConnectivity,
} from "@/lib/worker/supabase";

async function main(): Promise<void> {
  const args = parsePonsV2FeeBootstrapArgs(process.argv.slice(2));
  const config = loadWorkerConfig();
  const supabase = createWorkerSupabase(config);
  await proveSupabaseConnectivity(supabase);

  const rpc = createChainRpc(config.alchemyRpcUrl);
  const head = await rpc.getBlockNumber();
  workerLog(`chain head: ${head}`);

  const origin = resolvePonsV2FeeBootstrapOrigin({
    head,
    fromBlock: args.fromBlock,
    lookback: args.lookback,
  });
  const lastProcessedBlock = origin.lastProcessedBlock;

  const existing = await loadCursor(
    supabase,
    CURSOR_STREAM_PONS_V2_CURVE_FEES,
    config.chainId,
  );

  if (existing?.lastProcessedBlock === lastProcessedBlock && !args.force) {
    workerLog(
      `pons_v2_curve_fees already at last_processed_block=${lastProcessedBlock} (next=${origin.nextScanFromBlock}, ${origin.reason})`,
    );
    workerLog("idempotent no-op; re-run with --force to rewrite");
    return;
  }

  if (existing && !args.force) {
    workerLog(
      `pons_v2_curve_fees=${existing.lastProcessedBlock}; re-run with --force to overwrite this cursor only`,
    );
    process.exit(2);
  }

  const row = await upsertCursor(supabase, {
    streamName: CURSOR_STREAM_PONS_V2_CURVE_FEES,
    chainId: config.chainId,
    lastProcessedBlock,
  });

  workerLog(
    `bootstrapped ${CURSOR_STREAM_PONS_V2_CURVE_FEES}: last_processed_block=${row.lastProcessedBlock}`,
  );
  workerLog(
    `next fee scan begins at ${row.lastProcessedBlock + 1} (${origin.reason})`,
  );
  workerLog(
    "PONS factories/transfers and POOLS cursors were not read or written.",
  );
}

main().catch((err: unknown) => {
  workerError("bootstrap-pons-v2-fees failed", err);
  process.exit(1);
});
