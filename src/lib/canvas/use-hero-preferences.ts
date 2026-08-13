"use client";

/**
 * Shared local hero appearance state (localStorage-backed).
 * useSyncExternalStore so BrandHero + control palette stay in sync.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_HERO_PREFERENCES,
  HERO_PREFERENCES_STORAGE_KEY,
  nextHeroColor,
  readHeroPreferences,
  writeHeroPreferences,
  type HeroPreferences,
} from "@/lib/canvas/hero-preferences";

let memory: HeroPreferences = { ...DEFAULT_HERO_PREFERENCES };
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

function getSnapshot(): HeroPreferences {
  return memory;
}

function getServerSnapshot(): HeroPreferences {
  return DEFAULT_HERO_PREFERENCES;
}

function commit(next: HeroPreferences): void {
  memory = next;
  writeHeroPreferences(next);
  emit();
}

function hydrateFromStorage(): void {
  if (typeof window === "undefined") return;
  const next = readHeroPreferences(window.localStorage);
  if (next.color === memory.color && next.visible === memory.visible) {
    return;
  }
  memory = next;
  emit();
}

export type UseHeroPreferencesResult = {
  preferences: HeroPreferences;
  cycleColor: () => void;
  hideHero: () => void;
  showHero: () => void;
};

export function useHeroPreferences(): UseHeroPreferencesResult {
  const preferences = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    hydrateFromStorage();

    const onStorage = (event: StorageEvent) => {
      if (event.key !== HERO_PREFERENCES_STORAGE_KEY) return;
      memory = readHeroPreferences(window.localStorage);
      emit();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const cycleColor = useCallback(() => {
    commit({
      ...memory,
      color: nextHeroColor(memory.color),
    });
  }, []);

  const hideHero = useCallback(() => {
    commit({
      ...memory,
      visible: false,
    });
  }, []);

  const showHero = useCallback(() => {
    commit({
      ...memory,
      visible: true,
    });
  }, []);

  return { preferences, cycleColor, hideHero, showHero };
}

/** Test helper — reset module memory between cases. */
export function resetHeroPreferencesStoreForTests(
  next: HeroPreferences = DEFAULT_HERO_PREFERENCES,
): void {
  memory = { ...next };
  emit();
}
