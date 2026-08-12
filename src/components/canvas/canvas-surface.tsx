"use client";

/**
 * Main relative surface for live objects + movable PlayHTML objects.
 * Stable id is the PlayHTML movement bounds container.
 */

import { CanvasControlPalette } from "@/components/canvas/canvas-control-palette";
import { MovableLiveEventLayer } from "@/components/canvas/movable-live-event-layer";
import { MovableHero } from "@/components/canvas/movable-hero";
import { MovableLogo } from "@/components/canvas/movable-logo";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/hero";
import type { SlottedLiveEvent } from "@/lib/canvas/slots";

export type CanvasSurfaceProps = {
  liveItems?: readonly SlottedLiveEvent[];
};

export function CanvasSurface({ liveItems = [] }: CanvasSurfaceProps) {
  return (
    <div
      id={PLAYHTML_CANVAS_BOUNDS_ID}
      className="absolute inset-0 z-10"
      data-4663-canvas-surface
    >
      <MovableLogo />
      <MovableHero />
      <MovableLiveEventLayer items={liveItems} />
      <CanvasControlPalette />
    </div>
  );
}
