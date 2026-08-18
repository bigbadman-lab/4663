/**
 * Operator bootstrap for the PONS V2 Global Fees Paid cursor only.
 *
 * An explicit origin is required. Production 24h cohort:
 *   npm run worker:bootstrap-pons-v2-fees -- --lookback-hours 24
 *
 * Other origins:
 *   npm run worker:bootstrap-pons-v2-fees -- --from-block 33486660
 *   npm run worker:bootstrap-pons-v2-fees -- --lookback 500
 *   npm run worker:bootstrap-pons-v2-fees -- --from-head
 *
 * Existing cursor: refused unless --force.
 *
 * Does NOT touch pons_factories, pons_transfers, or POOLS cursors.
 * Does NOT read production_state. Does NOT scan from genesis.
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
import { findBlockForLookbackHours } from "@/lib/pons/curve-fee/block-time";
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

function isoFromUnix(unix: number): string {
  return new Date(unix * 1000).toISOString();
}

async function main(): Promise<void> {
  const args = parsePonsV2FeeBootstrapArgs(process.argv.slice(2));
  const config = loadWorkerConfig();
  const supabase = createWorkerSupabase(config);
  await proveSupabaseConnectivity(supabase);

  const rpc = createChainRpc(config.alchemyRpcUrl);
  const head = await rpc.getBlockNumber();
  const headBlock = await rpc.getBlock(head);

  workerLog(`chain_id=${config.chainId}`);
  workerLog(`chain head=${head} timestamp=${isoFromUnix(headBlock.timestamp)}`);

  let origin;
  let startTimestamp: number | null = null;

  if (args.lookbackHours !== null) {
    const found = await findBlockForLookbackHours(
      rpc,
      head,
      args.lookbackHours,
    );
    origin = {
      ...resolvePonsV2FeeBootstrapOrigin({
        head,
        fromBlock: found.startBlock.number,
      }),
      reason: `--lookback-hours ${args.lookbackHours}`,
    };
    startTimestamp = found.startBlock.timestamp;
    workerLog(
      `lookback target unix=${found.targetUnix} (${isoFromUnix(found.targetUnix)})`,
    );
  } else {
    origin = resolvePonsV2FeeBootstrapOrigin({
      head,
      fromBlock: args.fromBlock,
      lookback: args.lookback,
      fromHead: args.fromHead,
    });
    const startBlockNumber = Math.min(origin.nextScanFromBlock, head);
    const startBlock = await rpc.getBlock(startBlockNumber);
    startTimestamp = startBlock.timestamp;
  }

  const existing = await loadCursor(
    supabase,
    CURSOR_STREAM_PONS_V2_CURVE_FEES,
    config.chainId,
  );

  const catchUpBlocks = Math.max(0, head - origin.nextScanFromBlock + 1);

  workerLog(`origin reason=${origin.reason}`);
  workerLog(
    `selected start block=${origin.nextScanFromBlock} timestamp=${
      startTimestamp === null ? "unknown" : isoFromUnix(startTimestamp)
    }`,
  );
  workerLog(
    `cursor last_processed_block will be ${origin.lastProcessedBlock} (next scan ${origin.nextScanFromBlock})`,
  );
  workerLog(`estimated blocks to catch up=${catchUpBlocks}`);
  workerLog(
    `existing cursor=${
      existing
        ? `last_processed_block=${existing.lastProcessedBlock}`
        : "ABSENT"
    }`,
  );

  if (existing?.lastProcessedBlock === origin.lastProcessedBlock && !args.force) {
    workerLog("idempotent no-op; re-run with --force to rewrite");
    return;
  }

  if (existing && !args.force) {
    workerLog(
      `pons_v2_curve_fees already exists at ${existing.lastProcessedBlock}; re-run with --force to overwrite this cursor only`,
    );
    process.exit(2);
  }

  const row = await upsertCursor(supabase, {
    streamName: CURSOR_STREAM_PONS_V2_CURVE_FEES,
    chainId: config.chainId,
    lastProcessedBlock: origin.lastProcessedBlock,
  });

  workerLog(
    `final cursor ${CURSOR_STREAM_PONS_V2_CURVE_FEES} last_processed_block=${row.lastProcessedBlock}`,
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
