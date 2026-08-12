"use client";

/**
 * Client-only PlayHTML tree (must not SSR — playhtml touches `document`).
 */

import { PlayProvider } from "@playhtml/react";
import { usePathname } from "next/navigation";
import { CanvasChrome } from "@/components/canvas/canvas-chrome";
import { CanvasSurface } from "@/components/canvas/canvas-surface";
import type { SlottedLiveEvent } from "@/lib/canvas/slots";

export type CanvasPlayTreeProps = {
  liveItems: readonly SlottedLiveEvent[];
};

export function CanvasPlayTree({ liveItems }: CanvasPlayTreeProps) {
  const pathname = usePathname();

  return (
    <PlayProvider pathname={pathname ?? "/"}>
      <div
        className="relative min-h-dvh w-full overflow-x-hidden bg-white text-neutral-900"
        data-4663-canvas-root
      >
        <CanvasChrome />
        <CanvasSurface liveItems={liveItems} />
      </div>
    </PlayProvider>
  );
}
