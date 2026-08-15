"use client";

/**
 * Shared local RADAR sound preference (localStorage-backed).
 * useSyncExternalStore so the panel toggle stays hydration-safe.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_RADAR_SOUND_ENABLED,
  DEFAULT_RADAR_SOUND_VOLUME,
  RADAR_SOUND_STORAGE_KEY,
  RADAR_SOUND_VOLUME_STORAGE_KEY,
  readRadarSoundEnabled,
  readRadarSoundVolume,
  writeRadarSoundEnabled,
  writeRadarSoundVolume,
  type RadarSoundVolume,
} from "@/lib/events/radar-sound-preference";
import {
  armRadarAudioUnlockFromNextGesture,
  unlockRadarAudio,
} from "@/lib/events/radar-sound";

type RadarSoundPreferenceSnapshot = {
  enabled: boolean;
  volume: RadarSoundVolume;
};

let memory: RadarSoundPreferenceSnapshot = {
  enabled: DEFAULT_RADAR_SOUND_ENABLED,
  volume: DEFAULT_RADAR_SOUND_VOLUME,
};
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

const SERVER_SNAPSHOT: RadarSoundPreferenceSnapshot = {
  enabled: DEFAULT_RADAR_SOUND_ENABLED,
  volume: DEFAULT_RADAR_SOUND_VOLUME,
};

function getSnapshot(): RadarSoundPreferenceSnapshot {
  return memory;
}

function getServerSnapshot(): RadarSoundPreferenceSnapshot {
  return SERVER_SNAPSHOT;
}

function commitEnabled(next: boolean): void {
  memory = { ...memory, enabled: next };
  writeRadarSoundEnabled(next);
  emit();
}

function commitVolume(next: RadarSoundVolume): void {
  memory = { ...memory, volume: next };
  writeRadarSoundVolume(next);
  emit();
}

function hydrateFromStorage(): void {
  if (typeof window === "undefined") return;
  const enabled = readRadarSoundEnabled(window.localStorage);
  const volume = readRadarSoundVolume(window.localStorage);
  if (enabled === memory.enabled && volume === memory.volume) return;
  memory = { enabled, volume };
  emit();
}

export type UseRadarSoundPreferenceResult = {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  toggle: () => void;
  volume: RadarSoundVolume;
  setVolume: (next: RadarSoundVolume) => void;
  toggleVolume: () => void;
};

export function useRadarSoundPreference(): UseRadarSoundPreferenceResult {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    hydrateFromStorage();
    if (memory.enabled) armRadarAudioUnlockFromNextGesture();

    const onStorage = (event: StorageEvent) => {
      if (
        event.key !== RADAR_SOUND_STORAGE_KEY &&
        event.key !== RADAR_SOUND_VOLUME_STORAGE_KEY
      ) {
        return;
      }
      memory = {
        enabled: readRadarSoundEnabled(window.localStorage),
        volume: readRadarSoundVolume(window.localStorage),
      };
      emit();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    if (next) unlockRadarAudio();
    commitEnabled(next);
  }, []);

  const toggle = useCallback(() => {
    const next = !memory.enabled;
    if (next) unlockRadarAudio();
    commitEnabled(next);
  }, []);

  const setVolume = useCallback((next: RadarSoundVolume) => {
    commitVolume(next);
  }, []);

  const toggleVolume = useCallback(() => {
    commitVolume(memory.volume === "high" ? "low" : "high");
  }, []);

  return {
    enabled: snapshot.enabled,
    setEnabled,
    toggle,
    volume: snapshot.volume,
    setVolume,
    toggleVolume,
  };
}

/** Test helper — reset module memory between cases. */
export function resetRadarSoundPreferenceStoreForTests(
  next: Partial<RadarSoundPreferenceSnapshot> = {},
): void {
  memory = {
    enabled: next.enabled ?? DEFAULT_RADAR_SOUND_ENABLED,
    volume: next.volume ?? DEFAULT_RADAR_SOUND_VOLUME,
  };
  emit();
}
