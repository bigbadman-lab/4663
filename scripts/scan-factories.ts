/**
 * Bounded explicit factory range scan for Stage 4 live validation.
 * Does not require a bootstrap cursor.
 *
 * Usage:
 *   npm run worker:scan-factories -- --from-block 33485420 --to-block 33486670
 *   npm run worker:scan-factories -- --from-block 33485420 --to-block 33486670 --advance-cursor
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadDotenv({ path: resolve(process.cwd(), ".env"), quiet: true });

import { CURSOR_STREAM_PONS_FACTORIES } from "@/lib/pons/constants";
import { buildFactoryDefinitions } from "@/lib/pons/factories";
import { loadWorkerConfig } from "@/lib/worker/config";
import { createChainRpc } from "@/lib/worker/chain/rpc";
import { workerError, workerLog } from "@/lib/worker/log";
import { scanFactoryRange } from "@/lib/worker/pons/factory-scanner";
import { upsertCursor } from "@/lib/worker/repositories/cursors";
import {
  createWorkerSupabase,
  proveSupabaseConnectivity,
} from "@/lib/worker/supabase";

function parseArgs(argv: string[]): {
  fromBlock: number;
  toBlock: number;
  advanceCursor: boolean;
} {
  let fromBlock: number | null = null;
  let toBlock: number | null = null;
  let advanceCursor = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--advance-cursor") {
      advanceCursor = true;
      continue;
    }
    if (a === "--from-block") {
      fromBlock = Number(argv[++i]);
      continue;
    }
    if (a === "--to-block") {
      toBlock = Number(argv[++i]);
      continue;
    }
  }

  if (
    fromBlock === null ||
    toBlock === null ||
    !Number.isInteger(fromBlock) ||
    !Number.isInteger(toBlock)
  ) {
    throw new Error("require integer --from-block and --to-block");
  }
  if (fromBlock > toBlock) {
    throw new Error("from-block must be <= to-block");
  }
  if (toBlock - fromBlock > 50_000) {
    throw new Error(
      "refusing range > 50000 blocks; use explicit smaller windows",
    );
  }

  return { fromBlock, toBlock, advanceCursor };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadWorkerConfig();
  const supabase = createWorkerSupabase(config);
  await proveSupabaseConnectivity(supabase);
  const rpc = createChainRpc(config.alchemyRpcUrl);
  const factories = buildFactoryDefinitions({
    factoryV1: config.ponsFactoryV1,
    factoryV2: config.ponsFactoryV2,
  });

  workerLog(`bounded factory scan ${args.fromBlock}-${args.toBlock}`);
  const result = await scanFactoryRange({
    rpc,
    supabase,
    factories,
    fromBlock: args.fromBlock,
    toBlock: args.toBlock,
  });

  workerLog(
    `done rawLogs=${result.rawLogs} candidates=${result.candidates} inserted=${result.inserted} known=${result.alreadyKnown} fullyProcessed=${result.fullyProcessed}`,
  );
  for (const d of result.discovered) {
    workerLog(
      `  ${d.factoryVersion} token=${d.tokenAddress} market=${d.marketAddress} tx=${d.launchTxHash} block=${d.launchBlockNumber}`,
    );
  }
  for (const f of result.failures) {
    workerLog(`  FAIL ${f}`);
  }

  if (args.advanceCursor && result.fullyProcessed) {
    await upsertCursor(supabase, {
      streamName: CURSOR_STREAM_PONS_FACTORIES,
      chainId: config.chainId,
      lastProcessedBlock: args.toBlock,
    });
    workerLog(`cursor ${CURSOR_STREAM_PONS_FACTORIES} -> ${args.toBlock}`);
  } else if (args.advanceCursor && !result.fullyProcessed) {
    workerLog("cursor not advanced (scan incomplete)");
    process.exitCode = 2;
  }

  if (!result.fullyProcessed) {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  workerError("scan failed", err);
  process.exit(1);
});
