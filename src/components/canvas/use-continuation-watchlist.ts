"use client";

/**
 * Client poll for today's continuation monitoring watchlist.
 */

import { useEffect, useState } from "react";
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
    let timer: number | null = null;

    const load = async () => {
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
      }
    };

    void load();
    timer = window.setInterval(() => {
      void load();
    }, CONTINUATION_WATCHLIST_POLL_MS);

    return () => {
      cancelled = true;
      if (timer != null) window.clearInterval(timer);
    };
  }, []);

  return { tokens, status, generatedAt };
}
