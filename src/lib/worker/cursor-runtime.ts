import { startupResumeBlock } from "@/lib/pons/eligibility";
import type { CursorStreamName } from "@/lib/pons/types";
import type { CursorRow } from "@/lib/worker/db-types";

export type RuntimeCursorPlan = {
  streamName: CursorStreamName;
  /** Highest safely committed block in DB, or null if no cursor row. */
  lastProcessedBlock: number | null;
  /**
   * In-memory resume origin only.
   * max(0, N - 5); missing cursor treated as N = 0.
   * Does NOT write back to the database.
   */
  startupFromBlock: number;
};

/**
 * Prepare startup scan origins from durable cursors.
 * Never mutates persisted last_processed_block.
 */
export function prepareStartupCursors(
  cursors: Map<CursorStreamName, CursorRow | null>,
): RuntimeCursorPlan[] {
  const plans: RuntimeCursorPlan[] = [];

  for (const [streamName, row] of cursors) {
    const lastProcessedBlock = row?.lastProcessedBlock ?? null;
    const n = lastProcessedBlock ?? 0;
    plans.push({
      streamName,
      lastProcessedBlock,
      startupFromBlock: startupResumeBlock(n),
    });
  }

  return plans;
}
