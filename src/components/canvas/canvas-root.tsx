"use client";

/**
 * Stage 10A — single client root for the 4663 canvas.
 * Owns the public events hook exactly once; does not render event objects yet.
 */

import { usePublicEvents } from "@/lib/events/use-public-events";
import { CanvasChrome } from "@/components/canvas/canvas-chrome";
import { CanvasSurface } from "@/components/canvas/canvas-surface";

export function CanvasRoot() {
  // Sole Stage 10 event-stream owner. Retained for 10B; not rendered in 10A.
  usePublicEvents();

  return (
    <div
      className="relative min-h-dvh w-full overflow-x-hidden bg-white text-neutral-900"
      data-4663-canvas-root
    >
      <CanvasChrome />
      <CanvasSurface />
    </div>
  );
}
