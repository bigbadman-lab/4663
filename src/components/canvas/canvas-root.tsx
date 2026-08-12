"use client";

/**
 * Stage 10 — single client root for the 4663 canvas.
 * Owns the public events hook exactly once.
 */

import { useEffect, useMemo, useState } from "react";
import { CanvasChrome } from "@/components/canvas/canvas-chrome";
import { CanvasSurface } from "@/components/canvas/canvas-surface";
import { assignSlots } from "@/lib/canvas/slots";
import {
  LIVE_OBJECT_AGE_TICK_MS,
  LIVE_OBJECT_MAX_VISIBLE_DESKTOP,
  LIVE_OBJECT_MAX_VISIBLE_NARROW,
  selectVisibleLiveEvents,
} from "@/lib/canvas/visible-events";
import { usePublicEvents } from "@/lib/events/use-public-events";

function useLiveObjectCap(): number {
  const [cap, setCap] = useState(() => {
    if (typeof window === "undefined") return LIVE_OBJECT_MAX_VISIBLE_DESKTOP;
    return window.matchMedia("(max-width: 640px)").matches
      ? LIVE_OBJECT_MAX_VISIBLE_NARROW
      : LIVE_OBJECT_MAX_VISIBLE_DESKTOP;
  });

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = () => {
      setCap(
        mq.matches
          ? LIVE_OBJECT_MAX_VISIBLE_NARROW
          : LIVE_OBJECT_MAX_VISIBLE_DESKTOP,
      );
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return cap;
}

function useWallClockMs(tickMs: number): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);

  return nowMs;
}

export function CanvasRoot() {
  const { events } = usePublicEvents();
  const maxVisible = useLiveObjectCap();
  const nowMs = useWallClockMs(LIVE_OBJECT_AGE_TICK_MS);

  const liveItems = useMemo(() => {
    const visible = selectVisibleLiveEvents(events, nowMs, maxVisible);
    return assignSlots(visible);
  }, [events, nowMs, maxVisible]);

  return (
    <div
      className="relative min-h-dvh w-full overflow-x-hidden bg-white text-neutral-900"
      data-4663-canvas-root
    >
      <CanvasChrome />
      <CanvasSurface liveItems={liveItems} />
    </div>
  );
}
