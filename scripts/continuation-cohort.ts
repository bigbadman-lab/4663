/**
 * Observation 1E — read-only PONS CONTINUATION validation cohort reporter.
 *
 *   npm run worker:continuation-cohort
 *
 * Loads production observation boundary and prints the first 20 qualifying
 * pons_buyer_continuation events for manual review.
 *
 * NO mutations. NO event firing. NO RPC writes. NO cursor/heartbeat changes.
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadDotenv({ path: resolve(process.cwd(), ".env"), quiet: true });

import { formatCohortReportLines } from "@/lib/worker/continuation-cohort";
import { loadWorkerConfig } from "@/lib/worker/config";
import { workerError, workerLog } from "@/lib/worker/log";
import { loadContinuationValidationCohort } from "@/lib/worker/repositories/continuation-cohort";
import {
  createWorkerSupabase,
  proveSupabaseConnectivity,
} from "@/lib/worker/supabase";

async function main(): Promise<void> {
  workerLog("PONS CONTINUATION VALIDATION COHORT — READ ONLY");

  const config = loadWorkerConfig();
  const supabase = createWorkerSupabase(config);
  await proveSupabaseConnectivity(supabase);

  const result = await loadContinuationValidationCohort(
    supabase,
    config.chainId,
  );

  if (!result.ok) {
    workerError(result.error);
    workerLog("NO CHANGES APPLIED");
    process.exit(1);
  }

  if (result.observationVersion) {
    workerLog(`observation_version=${result.observationVersion}`);
  }

  for (const line of formatCohortReportLines(result.report, config.chainId)) {
    // formatCohortReportLines already includes the READ ONLY banner + NO CHANGES;
    // skip duplicate banner we printed at startup.
    if (line === "PONS CONTINUATION VALIDATION COHORT — READ ONLY") continue;
    if (line === "NO CHANGES APPLIED") {
      workerLog(line);
      continue;
    }
    workerLog(line);
  }
}

main().catch((err: unknown) => {
  workerError("continuation-cohort failed", err);
  console.error("[4663-worker] NO CHANGES APPLIED");
  process.exit(1);
});
