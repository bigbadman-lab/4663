/**
 * Health 2 — short-lived in-process cache for the PONS monitor snapshot.
 *
 * Instance-local only (warm Vercel/Node process). Not distributed.
 * Successful responses only; failures never poison the cache.
 */

import type {
  LoadPonsMonitorResult,
  PonsMonitorResponse,
} from "@/lib/pons/monitor";

/** Materially below the 8s client poll; useful coalescing without stale UI. */
export const PONS_MONITOR_CACHE_TTL_MS = 2_000 as const;

type CacheEntry = {
  body: PonsMonitorResponse;
  expiresAtMs: number;
};

let cached: CacheEntry | null = null;
let inFlight: Promise<LoadPonsMonitorResult> | null = null;

export type GetCachedPonsMonitorOptions = {
  /** Wall clock for freshness checks (injectable in tests). */
  nowMs?: number;
  /** Override TTL (defaults to PONS_MONITOR_CACHE_TTL_MS). */
  ttlMs?: number;
};

/**
 * Return a fresh cached monitor body, or load once and share the result.
 * Concurrent callers await the same in-flight promise while empty/expired.
 */
export async function getCachedPonsMonitor(
  load: () => Promise<LoadPonsMonitorResult>,
  options: GetCachedPonsMonitorOptions = {},
): Promise<LoadPonsMonitorResult> {
  const nowMs = options.nowMs ?? Date.now();
  const ttlMs = options.ttlMs ?? PONS_MONITOR_CACHE_TTL_MS;

  if (cached !== null && cached.expiresAtMs > nowMs) {
    return { ok: true, body: cached.body };
  }

  if (inFlight !== null) {
    return inFlight;
  }

  const pending = (async (): Promise<LoadPonsMonitorResult> => {
    try {
      const result = await load();
      if (result.ok) {
        // Expire relative to completion so slow loads do not shrink the window.
        const completedAt = options.nowMs ?? Date.now();
        cached = {
          body: result.body,
          expiresAtMs: completedAt + ttlMs,
        };
      }
      return result;
    } finally {
      // Always clear so failures/rejects do not stick and retries can proceed.
      inFlight = null;
    }
  })();

  inFlight = pending;
  return pending;
}

/** Test-only: clear success cache + in-flight handle. */
export function resetPonsMonitorCacheForTests(): void {
  cached = null;
  inFlight = null;
}
