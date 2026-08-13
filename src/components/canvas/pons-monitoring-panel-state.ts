"use client";

/**
 * Shared open state for the PONS monitoring watchlist panel.
 * Lets the dock CRYPTO control open the same panel as the monitoring object.
 */

import { useCallback, useSyncExternalStore } from "react";

let panelOpen = false;
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

function getSnapshot(): boolean {
  return panelOpen;
}

function getServerSnapshot(): boolean {
  return false;
}

export function openPonsMonitoringPanel(): void {
  if (panelOpen) return;
  panelOpen = true;
  emit();
}

export function closePonsMonitoringPanel(): void {
  if (!panelOpen) return;
  panelOpen = false;
  emit();
}

export function usePonsMonitoringPanelOpen(): {
  open: boolean;
  setOpen: (next: boolean) => void;
  openPanel: () => void;
  closePanel: () => void;
} {
  const open = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setOpen = useCallback((next: boolean) => {
    if (next) openPonsMonitoringPanel();
    else closePonsMonitoringPanel();
  }, []);

  return {
    open,
    setOpen,
    openPanel: openPonsMonitoringPanel,
    closePanel: closePonsMonitoringPanel,
  };
}

/** Test helper. */
export function resetPonsMonitoringPanelOpenForTests(): void {
  panelOpen = false;
  emit();
}
