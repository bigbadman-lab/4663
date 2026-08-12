"use client";

/**
 * Main relative surface for live (and later demo) canvas objects.
 */

import { LiveEventLayer } from "@/components/canvas/live-event-layer";
import type { SlottedLiveEvent } from "@/lib/canvas/slots";

export type CanvasSurfaceProps = {
  liveItems?: readonly SlottedLiveEvent[];
};

export function CanvasSurface({ liveItems = [] }: CanvasSurfaceProps) {
  return (
    <div className="absolute inset-0 z-10" data-4663-canvas-surface>
      <LiveEventLayer items={liveItems} />
    </div>
  );
}
