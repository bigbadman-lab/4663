/**
 * Closed-range operator verifier for PONS V2 Global Fees Paid.
 *
 *   npm run worker:verify-pons-v2-fees -- \
 *     --token 0x... \
 *     --curve 0x... \
 *     --quote 0x0000000000000000000000000000000000000000 \
 *     --from-block N \
 *     --to-block N
 *
 * Writes fee ledger + token_fee_metrics via apply_pons_v2_curve_fees.
 * Does not write chain_cursors, production_state, or RADAR events.
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadDotenv({ path: resolve(process.cwd(), ".env"), quiet: true });

import { formatQuoteAmountForDisplay } from "@/lib/pons/curve-fee/format";
import { scanPonsV2CurveFeesRange } from "@/lib/pons/curve-fee/scan";
import { decimalStringToUint256 } from "@/lib/pons/curve-fee/numeric";
import { createChainRpc } from "@/lib/worker/chain/rpc";
import { loadWorkerConfig } from "@/lib/worker/config";
import { isValidEvmAddress } from "@/lib/worker/env-address";
import {
  createWorkerSupabase,
  proveSupabaseConnectivity,
} from "@/lib/worker/supabase";

function requireFlag(argv: string[], name: string): string {
  const i = argv.indexOf(name);
  if (i < 0 || argv[i + 1] === undefined || argv[i + 1]!.startsWith("--")) {
    throw new Error(`missing ${name}`);
  }
  return argv[i + 1]!;
}

function parseAddressFlag(argv: string[], name: string): string {
  const raw = requireFlag(argv, name).trim();
  if (!isValidEvmAddress(raw)) {
    throw new Error(`${name} must be a 20-byte 0x address`);
  }
  return raw.toLowerCase();
}

function parseBlockFlag(argv: string[], name: string): number {
  const raw = requireFlag(argv, name);
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return n;
}

function lineAmount(label: string, quote: string, rawText: string): void {
  const shown = formatQuoteAmountForDisplay(
    quote,
    decimalStringToUint256(rawText),
  );
  if (shown.formatted !== null) {
    console.log(`${label}=${shown.raw}  (${shown.formatted} ETH)`);
    return;
  }
  console.log(`${label}=${shown.raw}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const token = parseAddressFlag(argv, "--token");
  const curve = parseAddressFlag(argv, "--curve");
  const quote = parseAddressFlag(argv, "--quote");
  const fromBlock = parseBlockFlag(argv, "--from-block");
  const toBlock = parseBlockFlag(argv, "--to-block");

  const config = loadWorkerConfig();
  const supabase = createWorkerSupabase(config);
  await proveSupabaseConnectivity(supabase);
  const rpc = createChainRpc(config.alchemyRpcUrl);

  console.log("PONS V2 CURVE FEE CLOSED-RANGE VERIFY");
  console.log(`chain_id=${config.chainId}`);
  console.log(`token=${token}`);
  console.log(`curve=${curve}`);
  console.log(`quote=${quote}`);
  console.log(`range=${fromBlock}-${toBlock}`);

  const result = await scanPonsV2CurveFeesRange({
    rpc,
    supabase,
    chainId: config.chainId,
    tokenAddress: token,
    curveAddress: curve,
    quoteTokenAddress: quote,
    fromBlock,
    toBlock,
  });

  const applyFailed = result.applyStatus === "failed";
  const verifyFailed = result.failures.some((f) => f.startsWith("verify_failed:"));

  console.log(`raw_logs=${result.rawLogs}`);
  console.log(`buys=${result.decodedBuys}`);
  console.log(`sells=${result.decodedSells}`);
  console.log(`malformed=${result.malformed}`);
  lineAmount("sum_fee_raw", quote, result.totalFeeRaw);
  lineAmount("sum_tax_raw", quote, result.totalTaxRaw);
  lineAmount("sum_global_fees_paid_raw", quote, result.totalPaidRaw);
  console.log(`apply_status=${result.applyStatus}`);
  console.log(`inserted=${result.inserted}`);
  console.log(`skipped_duplicates=${result.skippedDuplicates}`);
  if (applyFailed) {
    console.log("APPLY FAILED — RPC/DB transaction did not persist; inserted does not imply a write");
  }
  if (verifyFailed) {
    console.log("VERIFY FAILED — apply may have persisted; metrics/ledger load failed");
  }
  if (result.failures.length > 0) {
    console.log(`failures=${result.failures.join(" | ")}`);
  }
  if (result.malformedLogs.length > 0) {
    console.log("malformed_logs:");
    for (const log of result.malformedLogs) {
      console.log(
        `  topic0=${log.topic0 ?? "(none)"} knownEvent=${log.knownEvent ?? "(unknown)"} topicCount=${log.topicCount} dataBytes=${log.dataBytes} reason=${log.reason} block=${log.blockNumber ?? "null"} logIndex=${log.logIndex ?? "null"} tx=${log.txHash ?? "null"}`,
      );
    }
  }

  console.log("");
  console.log("DB token_fee_metrics (lifetime)");
  if (verifyFailed) {
    console.log("  (load failed)");
  } else if (!result.metricsAfter) {
    console.log("  (no row)");
  } else {
    const m = result.metricsAfter;
    lineAmount("  global_fees_paid_quote", m.quoteTokenAddress, m.globalFeesPaidQuote);
    lineAmount("  buy_fees_quote", m.quoteTokenAddress, m.buyFeesQuote);
    lineAmount("  sell_fees_quote", m.quoteTokenAddress, m.sellFeesQuote);
    console.log(`  buy_count=${m.buyCount}`);
    console.log(`  sell_count=${m.sellCount}`);
    console.log(`  last_fee_block=${m.lastFeeBlock}`);
    console.log(`  quote_token_address=${m.quoteTokenAddress}`);
  }

  console.log("");
  console.log("COMPARE");
  lineAmount("  scanned_range_total", quote, result.totalPaidRaw);
  lineAmount("  range_local_ledger_total", quote, result.rangeLocalPaidRaw);
  console.log(`  inserted_delta_count=${result.inserted}`);
  lineAmount("  lifetime_db_total", quote, result.lifetimePaidRaw);
  console.log(
    `  RANGE: ${result.rangeMatch ? "MATCH" : "MISMATCH"} (scanned range vs ledger rows in range)`,
  );
  console.log(
    "  LIFETIME: informational — may exceed the scanned range if earlier/later events exist",
  );

  if (result.failures.length > 0 || !result.rangeMatch) {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error("verify-pons-v2-fees failed", err);
  process.exit(1);
});
