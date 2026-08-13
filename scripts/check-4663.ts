/**
 * Official 4663 token preflight (read-only) — LAUNCH1.
 *
 *   npm run launch:check-4663
 *
 * Prints current activation state. Does not write.
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadDotenv({ path: resolve(process.cwd(), ".env"), quiet: true });

import { CHAIN_ID } from "@/lib/pons/constants";
import { loadOfficialTokenRow } from "@/lib/token/official-store";
import { createChainRpc } from "@/lib/worker/chain/rpc";
import { loadWorkerConfig } from "@/lib/worker/config";
import {
  createWorkerSupabase,
  proveSupabaseConnectivity,
} from "@/lib/worker/supabase";

function log(msg: string): void {
  console.log(`[4663-launch] ${msg}`);
}

function fail(msg: string): never {
  console.error(`[4663-launch] ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const config = loadWorkerConfig();
  log(`chain_id=${config.chainId}`);
  if (config.chainId !== CHAIN_ID) {
    fail(`invalid_chain configured=${config.chainId} expected=${CHAIN_ID}`);
  }

  const supabase = createWorkerSupabase(config);
  await proveSupabaseConnectivity(supabase);
  log("supabase=ok");

  const rpc = createChainRpc(config.alchemyRpcUrl);
  const head = await rpc.getBlockNumber();
  log(`rpc_head=${head}`);

  const loaded = await loadOfficialTokenRow(supabase, CHAIN_ID);
  if (!loaded.ok) {
    fail(`official_token_read_failed=${loaded.error}`);
  }

  if (!loaded.row) {
    log("official_token=inactive");
    log("next=npm run launch:activate-4663 -- --contract 0x...");
    return;
  }

  log("official_token=active");
  log(`official_contract=${loaded.row.contractAddress}`);
  log(`activated_at=${loaded.row.activatedAt}`);
  log(`activation_version=${loaded.row.activationVersion}`);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  fail(msg.replace(/https?:\/\/\S+/gi, "[redacted-url]"));
});
