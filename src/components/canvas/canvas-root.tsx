"use client";

/**
 * Stage 10 / Social 7 — single client root for the 4663 canvas.
 * Owns the public events hook exactly once.
 * PlayHTML mounts client-only (ssr: false) to avoid document access at prerender.
 */

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { CanvasChrome } from "@/components/canvas/canvas-chrome";
import { PonsMonitoringObject } from "@/components/canvas/pons-monitoring-object";
import { PonsMonitorTerminal } from "@/components/canvas/pons-monitor-terminal";
import type { PinnedLayerItem } from "@/components/canvas/pinned-pons-layer";
import {
  assignSlots,
  CANVAS_SLOTS,
  preferredSlotIndex,
} from "@/lib/canvas/slots";
import {
  LIVE_OBJECT_AGE_TICK_MS,
  LIVE_OBJECT_MAX_VISIBLE_DESKTOP,
  LIVE_OBJECT_MAX_VISIBLE_NARROW,
  selectVisibleLiveEvents,
} from "@/lib/canvas/visible-events";
import { usePublicEvents } from "@/lib/events/use-public-events";
import { suppressLiveEventsWhenPinned } from "@/lib/social/canvas-pin";
import {
  ParticipationProvider,
  useParticipation,
} from "@/lib/social/use-participation";
import { useCanvasPins } from "@/lib/social/use-canvas-pins";
import { WatchLiveEventPruner } from "@/components/social/watch-live-event-pruner";

const CanvasPlayTree = dynamic(
  () =>
    import("@/components/canvas/canvas-play-tree").then((m) => m.CanvasPlayTree),
  { ssr: false },
);

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

/** Pre-PlayHTML shell: brand via CanvasChrome; monitoring + live terminal. */
function CanvasShellFallback() {
  return (
    <div
      className="relative min-h-dvh w-full overflow-x-hidden bg-[var(--canvas-bg,#ffffff)] text-[color:var(--canvas-fg,#171717)]"
      data-4663-canvas-root
      data-4663-canvas-fallback
    >
      <CanvasChrome />
      <div
        className="absolute inset-0 z-10 overflow-hidden"
        data-4663-canvas-viewport
        data-4663-canvas-surface
        data-4663-canvas-fallback-surface
      >
        <div className="absolute inset-0" data-4663-home-region-fallback>
          <PonsMonitoringObject />
          <PonsMonitorTerminal />
        </div>
      </div>
    </div>
  );
}

function CanvasRootInner() {
  const { events } = usePublicEvents();
  const maxVisible = useLiveObjectCap();
  const nowMs = useWallClockMs(LIVE_OBJECT_AGE_TICK_MS);
  const [playReady, setPlayReady] = useState(false);
  const { self } = useParticipation();
  const { pins, pinnedEventIds, isPinned, createPin, unpin } = useCanvasPins();

  useEffect(() => {
    queueMicrotask(() => setPlayReady(true));
  }, []);

  const liveItems = useMemo(() => {
    const visible = selectVisibleLiveEvents(events, nowMs, maxVisible);
    const unpinned = suppressLiveEventsWhenPinned(visible, pinnedEventIds);
    return assignSlots(unpinned);
  }, [events, nowMs, maxVisible, pinnedEventIds]);

  const pinnedItems: PinnedLayerItem[] = useMemo(() => {
    return pins.map((pin) => {
      const index = preferredSlotIndex(pin.eventId, CANVAS_SLOTS.length);
      return {
        pin,
        slot: CANVAS_SLOTS[index]!,
      };
    });
  }, [pins]);

  const watchEventIds = useMemo(() => {
    const ids = new Set(liveItems.map((item) => item.event.id));
    for (const pin of pins) ids.add(pin.eventId);
    return [...ids];
  }, [liveItems, pins]);

  const onPin = async (eventId: string) => {
    if (!self) return { ok: false as const, error: "Enter to pin." };
    const result = await createPin({
      eventId,
      participationSessionId: self.sessionId,
      displayName: self.displayName,
      colour: self.colour,
    });
    if (!result.ok) return result;
    return { ok: true as const };
  };

  const onUnpin = async (pinId: string) => {
    if (!self) return { ok: false as const, error: "Enter to unpin." };
    return unpin(pinId, self.sessionId);
  };

  return (
    <>
      <WatchLiveEventPruner eventIds={watchEventIds} />
      {!playReady ? (
        <CanvasShellFallback />
      ) : (
        <CanvasPlayTree
          liveItems={liveItems}
          pinnedItems={pinnedItems}
          events={events}
          nowMs={nowMs}
          isPinned={isPinned}
          onPin={onPin}
          onUnpin={onUnpin}
        />
      )}
    </>
  );
}

export function CanvasRoot() {
  return (
    <ParticipationProvider>
      <CanvasRootInner />
    </ParticipationProvider>
  );
}
