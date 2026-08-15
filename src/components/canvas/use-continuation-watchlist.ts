"use client";

/**
 * Shared client poll for today's RADAR / continuation watchlist.
 * Health 1: pauses while document is hidden; resumes with an immediate fetch.
 * Live RADAR alerts follow visible tokens[] membership (ON OUR RADAR top-5).
 * Realtime continuation INSERT is a wake-up → immediate refresh (not a data source).
 *
 * Module singleton — one poller + one Realtime channel for monitoring + alerts.
 */

import { useSyncExternalStore } from "react";
import {
  browserVisibilityIntervalDeps,
  startVisibilityIntervalPolling,
} from "@/lib/browser/visibility-interval-poll";
import { getCanvasPlacementSnapshot } from "@/components/canvas/use-canvas-camera";
import {
  applyRadarWatchlistSnapshot,
  pruneExpiredRadarAlerts,
  radarAlertSpawnWorldPct,
  radarAlertFallbackWorldPct,
  type RadarAlert,
} from "@/lib/events/radar-alerts";
import { notifyRadarSoundForNewAlerts } from "@/lib/events/radar-sound";
import type {
  ContinuationWatchlistToken,
  RadarQualificationRef,
} from "@/lib/events/continuation-watchlist";
import {
  createRadarContinuationRealtimeClient,
  type RadarContinuationRealtimeClient,
} from "@/lib/events/radar-realtime";
import { getBrowserSupabaseClient } from "@/lib/events/supabase-browser";

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
/** Dedupes Realtime wake deliveries for the same continuation event id. */
const realtimeWakeIds = new Set<string>();
let seeded = false;
let started = false;
let stopPoller: (() => void) | null = null;
let stopRealtime: (() => void) | null = null;
let expiryTimer: number | null = null;
let inFlight = false;
let pendingRefresh = false;

/** Injectable Realtime factory for tests. */
let realtimeFactory: (() => RadarContinuationRealtimeClient) | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

function setStore(partial: Partial<StoreState>): void {
  store = { ...store, ...partial };
  emit();
}

function isDocumentVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
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
    const visibleTokens = nextTokens.filter(
      (t) =>
        typeof t?.eventId === "string" &&
        typeof t?.tokenAddress === "string",
    );
    const placement = getCanvasPlacementSnapshot();
    const applied = applyRadarWatchlistSnapshot({
      previousSeen: seenIds,
      seeded,
      previousAlerts: store.alerts,
      tokens: visibleTokens,
      nowMs,
      emitAlerts: isDocumentVisible(),
      resolvePosition: (_eventId, index) => {
        if (!placement) return radarAlertFallbackWorldPct(_eventId, index);
        return radarAlertSpawnWorldPct({
          viewport: placement.viewport,
          camera: placement.camera,
          index,
        });
      },
    });
    seenIds.clear();
    for (const id of applied.nextSeen) seenIds.add(id);
    seeded = applied.seeded;

    setStore({
      tokens: nextTokens,
      recentQualifications: nextRecent,
      generatedAt:
        typeof body.generatedAt === "string" ? body.generatedAt : null,
      status: "ready",
      alerts: applied.alerts,
    });
    notifyRadarSoundForNewAlerts(applied.newAlerts.length);
  } catch {
    setStore({ status: "error" });
  }
}

async function requestWatchlistRefresh(): Promise<void> {
  if (inFlight) {
    pendingRefresh = true;
    return;
  }
  inFlight = true;
  try {
    do {
      pendingRefresh = false;
      await loadWatchlist();
    } while (pendingRefresh);
  } finally {
    inFlight = false;
  }
}

function ensureRadarRealtime(): void {
  if (stopRealtime || typeof window === "undefined") return;
  try {
    const client =
      realtimeFactory?.() ??
      createRadarContinuationRealtimeClient(getBrowserSupabaseClient());
    const sub = client.subscribeInserts({
      onInsert: (wake) => {
        if (realtimeWakeIds.has(wake.eventId)) return;
        realtimeWakeIds.add(wake.eventId);
        // Hidden: do not refresh for alert creation yet — visibility resume
        // already triggers an immediate poll. Avoid burning work/timer.
        if (!isDocumentVisible()) return;
        void requestWatchlistRefresh();
      },
      onStatus: (status) => {
        // Reconnect convergence: refresh without clearing seen ids.
        if (status === "SUBSCRIBED" && isDocumentVisible()) {
          void requestWatchlistRefresh();
        }
      },
    });
    stopRealtime = () => sub.unsubscribe();
  } catch {
    // Missing env / SSR — poll-only fallback remains.
    stopRealtime = null;
  }
}

function ensureWatchlistPolling(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  const poller = startVisibilityIntervalPolling({
    ...browserVisibilityIntervalDeps(),
    intervalMs: CONTINUATION_WATCHLIST_POLL_MS,
    tick: () => requestWatchlistRefresh(),
  });
  stopPoller = () => poller.stop();

  ensureRadarRealtime();

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

export function useContinuationWatchlist(): ContinuationWatchlistStoreSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Test helper — reset module singleton between cases. */
export function resetContinuationWatchlistStoreForTests(): void {
  stopPoller?.();
  stopPoller = null;
  stopRealtime?.();
  stopRealtime = null;
  if (expiryTimer !== null) {
    window.clearInterval(expiryTimer);
    expiryTimer = null;
  }
  started = false;
  seeded = false;
  inFlight = false;
  pendingRefresh = false;
  seenIds.clear();
  realtimeWakeIds.clear();
  realtimeFactory = null;
  store = {
    tokens: [],
    recentQualifications: [],
    status: "loading",
    generatedAt: null,
    alerts: [],
  };
  emit();
}

/** Test helper — inject Realtime client before the store starts. */
export function setRadarContinuationRealtimeFactoryForTests(
  factory: (() => RadarContinuationRealtimeClient) | null,
): void {
  realtimeFactory = factory;
}

/** Test helper — expose coalesced refresh for unit tests. */
export function requestContinuationWatchlistRefreshForTests(): Promise<void> {
  return requestWatchlistRefresh();
}
