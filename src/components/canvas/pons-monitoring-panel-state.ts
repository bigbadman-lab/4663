"use client";

/**
 * Shared open + selected-token state for the RADAR (continuation watchlist) panel.
 * Dock control and monitoring object share this store.
 */

import { useCallback, useSyncExternalStore } from "react";

type PanelState = {
  open: boolean;
  /** When set, panel opens directly to token detail. */
  selectedTokenAddress: string | null;
};

let state: PanelState = { open: false, selectedTokenAddress: null };
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
  return { open: false, selectedTokenAddress: null };
}

function setState(next: PanelState): void {
  if (
    state.open === next.open &&
    state.selectedTokenAddress === next.selectedTokenAddress
  ) {
    return;
  }
  state = next;
  emit();
}

/** Open RADAR list (clears any prior selection). */
export function openPonsMonitoringPanel(): void {
  setState({ open: true, selectedTokenAddress: null });
}

/** Open RADAR focused on a token (live alert / deep link). */
export function openRadarToToken(tokenAddress: string): void {
  const normalized = tokenAddress.trim().toLowerCase();
  if (!normalized) return;
  setState({ open: true, selectedTokenAddress: normalized });
}

export function closePonsMonitoringPanel(): void {
  setState({ open: false, selectedTokenAddress: null });
}

export function clearRadarSelectedToken(): void {
  if (state.selectedTokenAddress === null) return;
  setState({ ...state, selectedTokenAddress: null });
}

export function usePonsMonitoringPanelOpen(): {
  open: boolean;
  selectedTokenAddress: string | null;
  setOpen: (next: boolean) => void;
  openPanel: () => void;
  openToToken: (tokenAddress: string) => void;
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
    setOpen,
    openPanel: openPonsMonitoringPanel,
    openToToken: openRadarToToken,
    closePanel: closePonsMonitoringPanel,
    clearSelectedToken: clearRadarSelectedToken,
  };
}

/** Test helper. */
export function resetPonsMonitoringPanelOpenForTests(): void {
  state = { open: false, selectedTokenAddress: null };
  emit();
}
