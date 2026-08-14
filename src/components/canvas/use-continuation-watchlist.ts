"use client";

/**
 * Shared client poll for today's RADAR / continuation watchlist.
 * Health 1: pauses while document is hidden; resumes with an immediate fetch.
 * Also drives live RADAR alert detection via recentQualifications.
 *
 * Module singleton — one poller for monitoring card + alert layer.
 */

import { useCallback, useSyncExternalStore } from "react";
import {
  browserVisibilityIntervalDeps,
  startVisibilityIntervalPolling,
} from "@/lib/browser/visibility-interval-poll";
import {
  diffRadarQualifications,
  pruneExpiredRadarAlerts,
  type RadarAlert,
} from "@/lib/events/radar-alerts";
import type {
  ContinuationWatchlistToken,
  RadarQualificationRef,
} from "@/lib/events/continuation-watchlist";

export const CONTINUATION_WATCHLIST_POLL_MS = 45_000 as const;

export type ContinuationWatchlistStoreSnapshot = {
  tokens: readonly ContinuationWatchlistToken[];
  recentQualifications: readonly RadarQualificationRef[];
  status: "loading" | "ready" | "error";
  generatedAt: string | null;
  alerts: readonly RadarAlert[];
};

type StoreState = {
  tokens: ContinuationWatchlistToken[];
  recentQualifications: RadarQualificationRef[];
  status: ContinuationWatchlistStoreSnapshot["status"];
  generatedAt: string | null;
  alerts: RadarAlert[];
};

const listeners = new Set<() => void>();
let store: StoreState = {
  tokens: [],
  recentQualifications: [],
  status: "loading",
  generatedAt: null,
  alerts: [],
};

const seenIds = new Set<string>();
let seeded = false;
let started = false;
let stopPoller: (() => void) | null = null;
let expiryTimer: number | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

function setStore(partial: Partial<StoreState>): void {
  store = { ...store, ...partial };
  emit();
}

async function loadWatchlist(): Promise<void> {
  try {
    const response = await fetch("/api/events/continuation-watchlist", {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) {
      setStore({ status: "error" });
      return;
    }
    const body = (await response.json()) as {
      generatedAt?: unknown;
      tokens?: unknown;
      recentQualifications?: unknown;
    };

    const nextTokens = Array.isArray(body.tokens)
      ? (body.tokens as ContinuationWatchlistToken[])
      : [];
    const nextRecent = Array.isArray(body.recentQualifications)
      ? (body.recentQualifications as RadarQualificationRef[])
      : [];

    const nowMs = Date.now();
    const diff = diffRadarQualifications({
      previousSeen: seenIds,
      seeded,
      qualifications: nextRecent.filter(
        (q) =>
          typeof q?.eventId === "string" &&
          typeof q?.tokenAddress === "string",
      ),
      nowMs,
    });
    seenIds.clear();
    for (const id of diff.nextSeen) seenIds.add(id);
    seeded = diff.seeded;

    const pruned = pruneExpiredRadarAlerts(store.alerts, nowMs);
    const alerts =
      diff.newAlerts.length === 0
        ? pruned
        : [...pruned, ...diff.newAlerts];

    setStore({
      tokens: nextTokens,
      recentQualifications: nextRecent,
      generatedAt:
        typeof body.generatedAt === "string" ? body.generatedAt : null,
      status: "ready",
      alerts,
    });
  } catch {
    setStore({ status: "error" });
  }
}

function ensureWatchlistPolling(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  let inFlight = false;
  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      await loadWatchlist();
    } finally {
      inFlight = false;
    }
  };

  const poller = startVisibilityIntervalPolling({
    ...browserVisibilityIntervalDeps(),
    intervalMs: CONTINUATION_WATCHLIST_POLL_MS,
    tick,
  });
  stopPoller = () => poller.stop();

  expiryTimer = window.setInterval(() => {
    const pruned = pruneExpiredRadarAlerts(store.alerts, Date.now());
    if (pruned.length !== store.alerts.length) {
      setStore({ alerts: pruned });
    }
  }, 15_000);
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  ensureWatchlistPolling();
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot(): ContinuationWatchlistStoreSnapshot {
  return store;
}

function getServerSnapshot(): ContinuationWatchlistStoreSnapshot {
  return {
    tokens: [],
    recentQualifications: [],
    status: "loading",
    generatedAt: null,
    alerts: [],
  };
}

export function dismissRadarAlert(eventId: string): void {
  setStore({
    alerts: store.alerts.filter((a) => a.eventId !== eventId),
  });
}

export type UseContinuationWatchlistResult = ContinuationWatchlistStoreSnapshot & {
  dismissAlert: (eventId: string) => void;
};

export function useContinuationWatchlist(): UseContinuationWatchlistResult {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const dismissAlert = useCallback((eventId: string) => {
    dismissRadarAlert(eventId);
  }, []);

  return {
    ...snapshot,
    dismissAlert,
  };
}

/** Test helper — reset module singleton between cases. */
export function resetContinuationWatchlistStoreForTests(): void {
  stopPoller?.();
  stopPoller = null;
  if (expiryTimer !== null) {
    window.clearInterval(expiryTimer);
    expiryTimer = null;
  }
  started = false;
  seeded = false;
  seenIds.clear();
  store = {
    tokens: [],
    recentQualifications: [],
    status: "loading",
    generatedAt: null,
    alerts: [],
  };
  emit();
}
