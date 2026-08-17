"use client";

/**
 * Shared open + selected-token state for the RADAR (continuation watchlist) panel.
 * Dock control and monitoring object share this store.
 */

import { useCallback, useSyncExternalStore } from "react";
import type { Launchpad } from "@/lib/radar/launchpad";

type PanelState = {
  open: boolean;
  /** When set, panel opens directly to token detail. */
  selectedTokenAddress: string | null;
  selectedLaunchpad: Launchpad | null;
};

/** Hydration snapshot — must be referentially stable across getServerSnapshot calls. */
const SERVER_SNAPSHOT: PanelState = Object.freeze({
  open: false,
  selectedTokenAddress: null,
  selectedLaunchpad: null,
});

let state: PanelState = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot(): PanelState {
  return state;
}

function getServerSnapshot(): PanelState {
  return SERVER_SNAPSHOT;
}

function setState(next: PanelState): void {
  if (
    state.open === next.open &&
    state.selectedTokenAddress === next.selectedTokenAddress &&
    state.selectedLaunchpad === next.selectedLaunchpad
  ) {
    return;
  }
  state = next;
  emit();
}

/** Open RADAR list (clears any prior selection). */
export function openPonsMonitoringPanel(): void {
  setState({
    open: true,
    selectedTokenAddress: null,
    selectedLaunchpad: null,
  });
}

/** Open RADAR focused on a token (live alert / deep link). */
export function openRadarToToken(
  tokenAddress: string,
  launchpad?: Launchpad | null,
): void {
  const normalized = tokenAddress.trim().toLowerCase();
  if (!normalized) return;
  setState({
    open: true,
    selectedTokenAddress: normalized,
    selectedLaunchpad: launchpad ?? null,
  });
}

export function closePonsMonitoringPanel(): void {
  setState({
    open: false,
    selectedTokenAddress: null,
    selectedLaunchpad: null,
  });
}

export function clearRadarSelectedToken(): void {
  if (
    state.selectedTokenAddress === null &&
    state.selectedLaunchpad === null
  ) {
    return;
  }
  setState({
    ...state,
    selectedTokenAddress: null,
    selectedLaunchpad: null,
  });
}

export function usePonsMonitoringPanelOpen(): {
  open: boolean;
  selectedTokenAddress: string | null;
  selectedLaunchpad: Launchpad | null;
  setOpen: (next: boolean) => void;
  openPanel: () => void;
  openToToken: (tokenAddress: string, launchpad?: Launchpad | null) => void;
  closePanel: () => void;
  clearSelectedToken: () => void;
} {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setOpen = useCallback((next: boolean) => {
    if (next) openPonsMonitoringPanel();
    else closePonsMonitoringPanel();
  }, []);

  return {
    open: snapshot.open,
    selectedTokenAddress: snapshot.selectedTokenAddress,
    selectedLaunchpad: snapshot.selectedLaunchpad,
    setOpen,
    openPanel: openPonsMonitoringPanel,
    openToToken: openRadarToToken,
    closePanel: closePonsMonitoringPanel,
    clearSelectedToken: clearRadarSelectedToken,
  };
}

/** Test helper. */
export function resetPonsMonitoringPanelOpenForTests(): void {
  state = SERVER_SNAPSHOT;
  emit();
}

/** Test helper — same getters React uses for useSyncExternalStore. */
export function getPonsMonitoringPanelSnapshotsForTests(): {
  getSnapshot: () => PanelState;
  getServerSnapshot: () => PanelState;
} {
  return { getSnapshot, getServerSnapshot };
}
