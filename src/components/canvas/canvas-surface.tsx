"use client";

/**
 * Main relative surface for live objects + movable PlayHTML hero.
 * Stable id is the PlayHTML movement bounds container.
 */

import { LiveEventLayer } from "@/components/canvas/live-event-layer";
import { MovableHero } from "@/components/canvas/movable-hero";
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
      <MovableHero />
      <LiveEventLayer items={liveItems} />
    </div>
  );
}
