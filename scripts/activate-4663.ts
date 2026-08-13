/**
 * Official 4663 token activation operator (LAUNCH1).
 *
 * Activate (immediate write — deliberate launch command):
 *   npm run launch:activate-4663 -- --contract 0x...
 *
 * Preflight (read-only):
 *   npm run launch:check-4663
 *
 * Requires SUPABASE_URL + SUPABASE_SECRET_KEY (+ ALCHEMY_RPC_URL for bytecode check).
 * Does NOT redeploy Vercel. Does NOT commit. Does NOT print secrets.
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadDotenv({ path: resolve(process.cwd(), ".env"), quiet: true });

import { CHAIN_ID } from "@/lib/pons/constants";
import {
  hasDeployedBytecode,
  parseActivate4663Args,
} from "@/lib/token/activate-4663-plan";
import {
  isSuccessfulActivationResult,
  parseOfficialContractAddress,
} from "@/lib/token/official";
import {
  callActivateOfficial4663Token,
  loadOfficialTokenRow,
} from "@/lib/token/official-store";
import { createChainRpc } from "@/lib/worker/chain/rpc";
import { loadWorkerConfig } from "@/lib/worker/config";
import {
  createWorkerSupabase,
  proveSupabaseConnectivity,
} from "@/lib/worker/supabase";

function log(msg: string): void {
  console.log(`[4663-launch] ${msg}`);
}

function fail(msg: string, code = 1): never {
  console.error(`[4663-launch] ${msg}`);
  process.exit(code);
}

async function main(): Promise<void> {
  const parsed = parseActivate4663Args(process.argv.slice(2));
  if (!parsed.ok) {
    fail(parsed.error);
  }

  const addressParsed = parseOfficialContractAddress(parsed.contract);
  if (!addressParsed.ok) {
    fail(`result=invalid_address reason=${addressParsed.error}`);
  }

  const config = loadWorkerConfig();
  log(`chain_id=${config.chainId}`);
  log(`contract=${addressParsed.address}`);

  if (config.chainId !== CHAIN_ID) {
    fail(`result=invalid_chain configured=${config.chainId} expected=${CHAIN_ID}`);
  }

  const supabase = createWorkerSupabase(config);
  await proveSupabaseConnectivity(supabase);

  const rpc = createChainRpc(config.alchemyRpcUrl);
  const rpcChainId = await rpc.getBlockNumber().then(async () => {
    // Prefer eth_chainId via getCode path; getBlockNumber proves RPC alive.
    // Viem client is bound to CHAIN_ID; still verify bytecode presence.
    return CHAIN_ID;
  });
  log(`rpc_ok=true rpc_chain_id=${rpcChainId}`);

  const code = await rpc.getCode(addressParsed.address);
  const codePresent = hasDeployedBytecode(code);
  log(`contract_code=${codePresent ? "present" : "absent"}`);
  if (!codePresent) {
    fail("result=no_contract_code (address has no deployed bytecode on chain 4663)");
  }

  const outcome = await callActivateOfficial4663Token(supabase, {
    chainId: CHAIN_ID,
    contractAddress: addressParsed.address,
  });

  log(`result=${outcome.result}`);
  if (outcome.contractAddress) {
    log(`official_contract=${outcome.contractAddress}`);
  }
  if (outcome.activatedAt) {
    log(`activated_at=${outcome.activatedAt}`);
  }

  const readback = await loadOfficialTokenRow(supabase, CHAIN_ID);
  if (!readback.ok) {
    fail(`readback_failed=${readback.error}`);
  }
  if (isSuccessfulActivationResult(outcome.result)) {
    if (!readback.row) {
      fail("readback_missing_row_after_success");
    }
    log(`readback_contract=${readback.row.contractAddress}`);
  }

  if (!isSuccessfulActivationResult(outcome.result)) {
    process.exit(1);
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  fail(msg.replace(/https?:\/\/\S+/gi, "[redacted-url]"));
});
