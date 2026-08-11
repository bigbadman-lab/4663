/**
 * Bounded Transfer scan for Stage 5 live validation.
 *
 *   npm run worker:scan-transfers -- --from-block X --to-block Y
 *   npm run worker:scan-transfers -- --from-block X --to-block Y --advance-cursor
 *
 * Loads ACTIVE launches + first buyers, enforces factory cursor >= to-block
 * when --advance-cursor is set.
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadDotenv({ path: resolve(process.cwd(), ".env"), quiet: true });

import {
  CURSOR_STREAM_PONS_FACTORIES,
  CURSOR_STREAM_PONS_TRANSFERS,
} from "@/lib/pons/constants";
import { loadWorkerConfig } from "@/lib/worker/config";
import { createChainRpc } from "@/lib/worker/chain/rpc";
import { workerError, workerLog } from "@/lib/worker/log";
import { scanTransferRange } from "@/lib/worker/pons/transfer-scanner";
import { loadCursor, upsertCursor } from "@/lib/worker/repositories/cursors";
import { loadFirstBuyersForTokens } from "@/lib/worker/repositories/first-buyers";
import { loadActiveLaunches } from "@/lib/worker/repositories/launches";
import { reconstructWorkerMemory } from "@/lib/worker/state";
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
    !Number.isInteger(toBlock) ||
    fromBlock > toBlock
  ) {
    throw new Error("require integers --from-block <= --to-block");
  }
  if (toBlock - fromBlock > 20_000) {
    throw new Error("refusing transfer range > 20000 blocks");
  }

  return { fromBlock, toBlock, advanceCursor };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadWorkerConfig();
  const supabase = createWorkerSupabase(config);
  await proveSupabaseConnectivity(supabase);
  const rpc = createChainRpc(config.alchemyRpcUrl);

  const launches = await loadActiveLaunches(supabase, config.chainId);
  const firstBuyers = await loadFirstBuyersForTokens(
    supabase,
    config.chainId,
    launches.map((l) => l.tokenAddress),
  );
  const memory = reconstructWorkerMemory(launches, firstBuyers);
  workerLog(
    `bounded transfer scan ${args.fromBlock}-${args.toBlock} active=${memory.activeTokens.size}`,
  );

  if (args.advanceCursor) {
    const factory = await loadCursor(
      supabase,
      CURSOR_STREAM_PONS_FACTORIES,
      config.chainId,
    );
    if (!factory || factory.lastProcessedBlock < args.toBlock) {
      throw new Error(
        `factory cursor must be >= ${args.toBlock} before advancing transfers (have=${factory?.lastProcessedBlock ?? "none"})`,
      );
    }
  }

  const result = await scanTransferRange({
    rpc,
    supabase,
    chainId: config.chainId,
    memory,
    fromBlock: args.fromBlock,
    toBlock: args.toBlock,
  });

  workerLog(
    `done logs=${result.transferLogs} candidates=${result.marketToWalletCandidates} validations=${result.txValidations} newBuyers=${result.newFirstBuyers} known=${result.alreadyKnownBuyers} notBuys=${result.notBuys} fullyProcessed=${result.fullyProcessed}`,
  );
  for (const f of result.failures) workerLog(`  FAIL ${f}`);

  if (args.advanceCursor && result.fullyProcessed) {
    await upsertCursor(supabase, {
      streamName: CURSOR_STREAM_PONS_TRANSFERS,
      chainId: config.chainId,
      lastProcessedBlock: args.toBlock,
    });
    workerLog(`cursor ${CURSOR_STREAM_PONS_TRANSFERS} -> ${args.toBlock}`);
  } else if (args.advanceCursor && !result.fullyProcessed) {
    workerLog("cursor not advanced (incomplete)");
    process.exitCode = 2;
  }

  // After durable buyers (+ optional cursor), evaluate lifecycle at range tip block time.
  if (result.fullyProcessed && memory.activeTokens.size > 0) {
    const { evaluateLifecycleAtProcessedBlock } = await import(
      "@/lib/worker/pons/lifecycle"
    );
    const life = await evaluateLifecycleAtProcessedBlock({
      rpc,
      supabase,
      chainId: config.chainId,
      memory,
      evaluationBlockNumber: args.toBlock,
    });
    workerLog(
      `lifecycle fired=${life.fired} expired=${life.expired} fireFail=${life.fireOperationalFailures} notEligible=${life.notEligible}`,
    );
  }

  if (!result.fullyProcessed) process.exitCode = 1;
}

main().catch((err: unknown) => {
  workerError("scan-transfers failed", err);
  process.exit(1);
});
