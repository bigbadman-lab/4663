"use client";

/**
 * Client poll for today's continuation monitoring watchlist.
 * Health 1: pauses while document is hidden; resumes with an immediate fetch.
 */

import { useEffect, useState } from "react";
import {
  browserVisibilityIntervalDeps,
  startVisibilityIntervalPolling,
} from "@/lib/browser/visibility-interval-poll";
import type { ContinuationWatchlistToken } from "@/lib/events/continuation-watchlist";

export const CONTINUATION_WATCHLIST_POLL_MS = 45_000 as const;

export type UseContinuationWatchlistResult = {
  tokens: readonly ContinuationWatchlistToken[];
  status: "loading" | "ready" | "error";
  generatedAt: string | null;
};

export function useContinuationWatchlist(): UseContinuationWatchlistResult {
  const [tokens, setTokens] = useState<ContinuationWatchlistToken[]>([]);
  const [status, setStatus] =
    useState<UseContinuationWatchlistResult["status"]>("loading");
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const load = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/events/continuation-watchlist", {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok) {
          if (!cancelled) setStatus("error");
          return;
        }
        const body = (await response.json()) as {
          generatedAt?: unknown;
          tokens?: unknown;
        };
        if (!cancelled) {
          const next = Array.isArray(body.tokens)
            ? (body.tokens as ContinuationWatchlistToken[])
            : [];
          setTokens(next);
          setGeneratedAt(
            typeof body.generatedAt === "string" ? body.generatedAt : null,
          );
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("error");
      } finally {
        inFlight = false;
      }
    };

    const poller = startVisibilityIntervalPolling({
      ...browserVisibilityIntervalDeps(),
      intervalMs: CONTINUATION_WATCHLIST_POLL_MS,
      tick: load,
    });

    return () => {
      cancelled = true;
      poller.stop();
    };
  }, []);

  return { tokens, status, generatedAt };
}
