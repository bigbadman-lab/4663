/**
 * Browser poll of GET /api/presence/summary (injectable for tests).
 * Health 1: pauses while document is hidden; resumes with an immediate fetch.
 */

import {
  browserVisibilityIntervalDeps,
  startVisibilityIntervalPolling,
} from "@/lib/browser/visibility-interval-poll";
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
  getVisibilityState?: () => DocumentVisibilityState;
  addEventListener?: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => void;
  removeEventListener?: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ) => void;
};

/**
 * Starts immediate fetch + interval while visible.
 * Retains last good snapshot on failure / while hidden.
 * Skips overlapping in-flight requests. Call stop() on unmount.
 */
export function startPresenceSummaryPolling(
  deps: PresenceSummaryPollerDeps,
): { stop: () => void } {
  let stopped = false;
  let inFlight = false;
  let lastGood: PresenceSummaryResponse | null = null;
  const intervalMs = deps.intervalMs ?? PRESENCE_SUMMARY_POLL_MS;
  const browser = browserVisibilityIntervalDeps();

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

  const poller = startVisibilityIntervalPolling({
    intervalMs,
    tick,
    getVisibilityState:
      deps.getVisibilityState ?? browser.getVisibilityState,
    setIntervalFn: deps.setIntervalFn,
    clearIntervalFn: deps.clearIntervalFn,
    addEventListener: deps.addEventListener ?? browser.addEventListener,
    removeEventListener:
      deps.removeEventListener ?? browser.removeEventListener,
  });

  return {
    stop: () => {
      stopped = true;
      poller.stop();
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
