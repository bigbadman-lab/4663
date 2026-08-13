/**
 * Stage 8A.7 — read-only Summon history integrity reporter.
 *
 *   npm run worker:verify-summon-history
 *
 * Loads verified / failed pons_buyer_continuation candidates for Summon.
 * NO mutations.
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadDotenv({ path: resolve(process.cwd(), ".env"), quiet: true });

import { loadSummonHistoryEvents } from "@/lib/events/summon-history";
import { createPresenceSupabase } from "@/lib/presence/supabase-server";

async function main(): Promise<void> {
  console.log("SUMMON HISTORY INTEGRITY — READ ONLY");
  const supabase = createPresenceSupabase();
  const result = await loadSummonHistoryEvents(supabase, 50);
  if (!result.ok) {
    console.error(result.error);
    console.log("NO CHANGES APPLIED");
    process.exit(1);
  }

  const { integrity, body } = result;
  console.log(`checked=${integrity.checked}`);
  console.log(`passed=${integrity.passed}`);
  console.log(`failed=${integrity.failed}`);
  console.log(`returned_for_summon=${body.events.length}`);

  for (const report of integrity.reports) {
    console.log("");
    console.log(`event_id=${report.eventId}`);
    console.log(`token=${report.tokenAddress}`);
    console.log(`launch_timestamp=${report.launchTimestampIso ?? "unavailable"}`);
    console.log(`pre_180=${report.pre180Count}`);
    console.log(`continuation_[180,300)=${report.continuationWindowCount}`);
    console.log(
      `second_continuation_buyer_at=${report.secondContinuationBuyerAt ?? "unavailable"}`,
    );
    console.log(`stored_occurred_at=${report.storedOccurredAt}`);
    console.log(`status=${report.status}`);
    for (const reason of report.reasons) {
      console.log(`reason=${reason}`);
    }
  }

  console.log("");
  console.log("NO CHANGES APPLIED");
}

main().catch((err: unknown) => {
  console.error("verify-summon-history failed", err);
  console.log("NO CHANGES APPLIED");
  process.exit(1);
});
