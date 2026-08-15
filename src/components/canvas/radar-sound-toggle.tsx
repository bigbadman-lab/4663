"use client";

/**
 * RADAR panel SOUND ON/OFF + VOL LOW/HIGH — local preference only.
 */

import { useRadarSoundPreference } from "@/lib/events/use-radar-sound-preference";

const CONTROL_CLASS =
  "inline-flex min-h-11 items-center font-mono text-[11px] tracking-wide text-neutral-400 transition-colors hover:text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400";

export function RadarSoundToggle() {
  const { enabled, toggle, volume, toggleVolume } = useRadarSoundPreference();
  const soundLabel = enabled ? "SOUND ON" : "SOUND OFF";
  const volumeLabel = volume === "high" ? "VOL HIGH" : "VOL LOW";

  return (
    <>
      <button
        type="button"
        className={CONTROL_CLASS}
        aria-label={soundLabel}
        aria-pressed={enabled}
        data-4663-radar-sound
        data-4663-radar-sound-enabled={enabled ? "true" : "false"}
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
      >
        [ {soundLabel} ]
      </button>
      <button
        type="button"
        className={CONTROL_CLASS}
        aria-label={volumeLabel}
        aria-pressed={volume === "high"}
        data-4663-radar-sound-volume
        data-4663-radar-sound-volume-level={volume}
        onClick={(event) => {
          event.stopPropagation();
          toggleVolume();
        }}
      >
        [ {volumeLabel} ]
      </button>
    </>
  );
}
