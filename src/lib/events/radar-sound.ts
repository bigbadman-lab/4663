/**
 * Optional RADAR alert ping — Web Audio only, no assets.
 * Fail-soft: never throw into radar behaviour.
 */

import {
  readRadarSoundEnabled,
  readRadarSoundVolume,
  type RadarSoundVolume,
} from "@/lib/events/radar-sound-preference";

/** Soft two-tone ping; total envelope ~260ms. */
export const RADAR_PING_DURATION_MS = 260 as const;
export const RADAR_PING_PEAK_GAIN_LOW = 0.045 as const;
export const RADAR_PING_PEAK_GAIN_HIGH = 0.18 as const;
const TONE_A_HZ = 620;
const TONE_B_HZ = 880;

export function resolveRadarPingPeakGain(
  volume: RadarSoundVolume = readRadarSoundVolume(),
): number {
  return volume === "high"
    ? RADAR_PING_PEAK_GAIN_HIGH
    : RADAR_PING_PEAK_GAIN_LOW;
}

type AudioContextLike = Pick<
  AudioContext,
  "state" | "currentTime" | "resume" | "createOscillator" | "createGain" | "destination"
>;

type RadarSoundHooks = {
  getContext: () => AudioContextLike | null;
  isDocumentVisible: () => boolean;
  play: (peakGain: number) => void;
};

let context: AudioContextLike | null = null;
let testHooks: Partial<RadarSoundHooks> | null = null;
let unlockArmed = false;

function defaultIsDocumentVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

function createBrowserAudioContext(): AudioContextLike | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (
      window as unknown as {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;
  if (!Ctor) return null;
  return new Ctor();
}

function getContext(): AudioContextLike | null {
  if (testHooks?.getContext) return testHooks.getContext();
  if (context) return context;
  try {
    context = createBrowserAudioContext();
  } catch {
    context = null;
  }
  return context;
}

function startTone(
  ctx: AudioContextLike,
  frequency: number,
  start: number,
  duration: number,
  peak: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function playRadarPingInternal(peakGain: number): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }
  if (ctx.state !== "running") return;

  const t0 = ctx.currentTime;
  startTone(ctx, TONE_A_HZ, t0, 0.16, peakGain);
  startTone(ctx, TONE_B_HZ, t0 + 0.1, 0.16, peakGain * 0.7);
}

/** Resume/create AudioContext from a user gesture (SOUND toggle). */
export function unlockRadarAudio(): void {
  try {
    const ctx = getContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
  } catch {
    // Safari / autoplay policy — stay silent.
  }
}

/**
 * After reload with SOUND ON, resume on the next genuine pointer gesture.
 * Does not play audio and does not force autoplay on load.
 */
export function armRadarAudioUnlockFromNextGesture(): void {
  if (typeof window === "undefined" || unlockArmed) return;
  unlockArmed = true;
  const unlock = () => {
    unlockArmed = false;
    unlockRadarAudio();
    window.removeEventListener("pointerdown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
}

/** Short radar ping. Never throws. */
export function playRadarPing(peakGain?: number): void {
  const gain = peakGain ?? resolveRadarPingPeakGain();
  try {
    if (testHooks?.play) {
      testHooks.play(gain);
      return;
    }
    if (!defaultIsDocumentVisible()) return;
    playRadarPingInternal(gain);
  } catch {
    // Audio unavailable — radar must continue.
  }
}

/**
 * One ping per snapshot that accepted ≥1 new alert.
 * Hidden tabs and SOUND OFF produce no audio.
 * Volume only changes gain — it never creates a new trigger path.
 */
export function notifyRadarSoundForNewAlerts(
  newAlertCount: number,
  options?: {
    enabled?: boolean;
    visible?: boolean;
    volume?: RadarSoundVolume;
    play?: (peakGain: number) => void;
  },
): void {
  if (newAlertCount <= 0) return;
  const visible =
    options?.visible ??
    (testHooks?.isDocumentVisible ?? defaultIsDocumentVisible)();
  if (!visible) return;
  const enabled = options?.enabled ?? readRadarSoundEnabled();
  if (!enabled) return;
  const volume = options?.volume ?? readRadarSoundVolume();
  const peakGain = resolveRadarPingPeakGain(volume);
  const play = options?.play ?? playRadarPing;
  try {
    play(peakGain);
  } catch {
    // Playback failure must not affect alerts.
  }
}

/** Test helper — inject audio/visibility. Pass null to restore. */
export function setRadarSoundTestHooks(
  next: Partial<RadarSoundHooks> | null,
): void {
  testHooks = next;
  if (next === null) {
    context = null;
    unlockArmed = false;
  }
}
