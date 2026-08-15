/**
 * Local-only RADAR sound preference (per browser / device).
 * Never synced via PlayHTML, Supabase, presence, or collaborative state.
 */

export const RADAR_SOUND_STORAGE_KEY = "4663:radar-sound" as const;

export const RADAR_SOUND_VOLUME_STORAGE_KEY = "4663:radar-sound-volume" as const;

export const DEFAULT_RADAR_SOUND_ENABLED = false as const;

export const RADAR_SOUND_VOLUMES = ["low", "high"] as const;

export type RadarSoundVolume = (typeof RADAR_SOUND_VOLUMES)[number];

export const DEFAULT_RADAR_SOUND_VOLUME: RadarSoundVolume = "low";

export function normalizeRadarSoundEnabled(value: unknown): boolean {
  if (value === true || value === "on" || value === "true") return true;
  return false;
}

export function readRadarSoundEnabled(
  storage: Pick<Storage, "getItem"> | null | undefined = typeof window !==
    "undefined"
    ? window.localStorage
    : null,
): boolean {
  if (!storage) return DEFAULT_RADAR_SOUND_ENABLED;
  try {
    const raw = storage.getItem(RADAR_SOUND_STORAGE_KEY);
    if (raw == null || raw === "") return DEFAULT_RADAR_SOUND_ENABLED;
    return normalizeRadarSoundEnabled(raw);
  } catch {
    return DEFAULT_RADAR_SOUND_ENABLED;
  }
}

export function writeRadarSoundEnabled(
  enabled: boolean,
  storage: Pick<Storage, "setItem"> | null | undefined = typeof window !==
    "undefined"
    ? window.localStorage
    : null,
): void {
  if (!storage) return;
  try {
    storage.setItem(RADAR_SOUND_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Quota / private mode — preference stays in-memory only.
  }
}

export function normalizeRadarSoundVolume(value: unknown): RadarSoundVolume {
  if (value === "high") return "high";
  return DEFAULT_RADAR_SOUND_VOLUME;
}

export function readRadarSoundVolume(
  storage: Pick<Storage, "getItem"> | null | undefined = typeof window !==
    "undefined"
    ? window.localStorage
    : null,
): RadarSoundVolume {
  if (!storage) return DEFAULT_RADAR_SOUND_VOLUME;
  try {
    const raw = storage.getItem(RADAR_SOUND_VOLUME_STORAGE_KEY);
    if (raw == null || raw === "") return DEFAULT_RADAR_SOUND_VOLUME;
    return normalizeRadarSoundVolume(raw);
  } catch {
    return DEFAULT_RADAR_SOUND_VOLUME;
  }
}

export function writeRadarSoundVolume(
  volume: RadarSoundVolume,
  storage: Pick<Storage, "setItem"> | null | undefined = typeof window !==
    "undefined"
    ? window.localStorage
    : null,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      RADAR_SOUND_VOLUME_STORAGE_KEY,
      normalizeRadarSoundVolume(volume),
    );
  } catch {
    // Quota / private mode — preference stays in-memory only.
  }
}
