/**
 * Browser poll of GET /api/presence/summary (injectable for tests).
 */

import {
  parsePresenceSummaryJson,
  PRESENCE_SUMMARY_POLL_MS,
} from "@/lib/presence/format-presence";
import type { PresenceSummaryResponse } from "@/lib/presence/summary";

export type PresenceSummaryPollerDeps = {
  fetchSummary: () => Promise<unknown>;
  setIntervalFn: (handler: () => void, ms: number) => unknown;
  clearIntervalFn: (id: unknown) => void;
  intervalMs?: number;
  onUpdate: (summary: PresenceSummaryResponse | null) => void;
};

/**
 * Starts immediate fetch + interval. Retains last good snapshot on failure.
 * Skips overlapping in-flight requests. Call stop() on unmount.
 */
export function startPresenceSummaryPolling(
  deps: PresenceSummaryPollerDeps,
): { stop: () => void } {
  let stopped = false;
  let inFlight = false;
  let lastGood: PresenceSummaryResponse | null = null;
  const intervalMs = deps.intervalMs ?? PRESENCE_SUMMARY_POLL_MS;

  const tick = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const raw = await deps.fetchSummary();
      const parsed = parsePresenceSummaryJson(raw);
      if (parsed) {
        lastGood = parsed;
        if (!stopped) deps.onUpdate(parsed);
      } else if (!stopped) {
        deps.onUpdate(lastGood);
      }
    } catch {
      if (!stopped) deps.onUpdate(lastGood);
    } finally {
      inFlight = false;
    }
  };

  void tick();
  const timer = deps.setIntervalFn(() => {
    void tick();
  }, intervalMs);

  return {
    stop: () => {
      stopped = true;
      deps.clearIntervalFn(timer);
    },
  };
}

export async function fetchPresenceSummaryJson(
  fetchFn: typeof fetch = fetch,
): Promise<unknown> {
  const res = await fetchFn("/api/presence/summary", {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`presence summary HTTP ${res.status}`);
  }
  return res.json();
}
