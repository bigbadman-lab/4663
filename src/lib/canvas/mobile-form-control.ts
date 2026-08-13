/**
 * IC3.7 — mobile form-control sizing inside the local camera world.
 *
 * iOS Safari zooms focused inputs when their *screen* font size is < 16px.
 * Creators live under `#4663-world` transform scale, so CSS px ≠ screen px
 * when camera.scale ≠ 1. Counter-scale restores ~1:1 screen size for the
 * temporary composer chrome only (published objects stay world-scaled).
 */

import { normalizeCameraScale } from "@/lib/canvas/world-camera";

/** Tailwind: ≥16px on mobile; preserve 12px composer type from `sm` up. */
export const MOBILE_SAFE_COMPOSER_INPUT_CLASS =
  "text-base sm:text-[12px]" as const;

/**
 * Inverse of the current local world scale so a child appears unscaled on
 * screen while remaining anchored at world %.
 */
export function worldScaleCounterScale(worldScale: number): number {
  const scale = normalizeCameraScale(worldScale);
  return 1 / scale;
}
