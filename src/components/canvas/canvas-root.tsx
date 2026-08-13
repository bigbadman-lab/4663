"use client";

/**
 * Stage 10 — single client root for the 4663 canvas.
 * Owns the public events hook exactly once.
 * PlayHTML mounts client-only (ssr: false) to avoid document access at prerender.
 */

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { CanvasChrome } from "@/components/canvas/canvas-chrome";
import { LiveEventLayer } from "@/components/canvas/live-event-layer";
import {
  HERO_SUBTITLE_DEFAULT_STYLE,
  HERO_TITLE_DEFAULT_STYLE,
  LOGO_DEFAULT_STYLE,
  PLAYHTML_CANVAS_BOUNDS_ID,
  PLAYHTML_HERO_SUBTITLE_ID,
  PLAYHTML_HERO_TITLE_ID,
  PLAYHTML_LOGO_ID,
} from "@/lib/canvas/hero";
import { assignSlots, type SlottedLiveEvent } from "@/lib/canvas/slots";
import {
  LIVE_OBJECT_AGE_TICK_MS,
  LIVE_OBJECT_MAX_VISIBLE_DESKTOP,
  LIVE_OBJECT_MAX_VISIBLE_NARROW,
  selectVisibleLiveEvents,
} from "@/lib/canvas/visible-events";
import { usePublicEvents } from "@/lib/events/use-public-events";
import { ParticipationProvider } from "@/lib/social/use-participation";
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

/** Pre-PlayHTML shell: same default hero origins, no drag. */
function CanvasShellFallback({
  liveItems,
}: {
  liveItems: readonly SlottedLiveEvent[];
}) {
  return (
    <div
      className="relative min-h-dvh w-full overflow-x-hidden bg-white text-neutral-900"
      data-4663-canvas-root
      data-4663-canvas-fallback
    >
      <CanvasChrome />
      <div
        id={PLAYHTML_CANVAS_BOUNDS_ID}
        className="absolute inset-0 z-10"
        data-4663-canvas-surface
      >
        <div
          id={PLAYHTML_LOGO_ID}
          className="absolute z-[15] select-none"
          style={LOGO_DEFAULT_STYLE}
        >
          <div className="h-16 w-16 overflow-hidden rounded-[16px] sm:h-[72px] sm:w-[72px] sm:rounded-[18px]">
            <Image
              src="/4663pfp.png"
              alt="4663"
              width={72}
              height={72}
              className="h-full w-full object-cover"
              draggable={false}
              priority
            />
          </div>
        </div>
        <div
          id={PLAYHTML_HERO_TITLE_ID}
          className="absolute z-[15] select-none"
          style={HERO_TITLE_DEFAULT_STYLE}
        >
          <h1 className="-translate-x-1/2 -translate-y-1/2 text-5xl font-semibold tracking-tight text-neutral-900 sm:text-6xl">
            4663
          </h1>
        </div>
        <div
          id={PLAYHTML_HERO_SUBTITLE_ID}
          className="absolute z-[15] max-w-[16rem] select-none sm:max-w-none"
          style={HERO_SUBTITLE_DEFAULT_STYLE}
        >
          <p className="-translate-x-1/2 text-center font-mono text-[11px] leading-snug tracking-wide text-neutral-400 sm:text-xs">
            live intelligence for robinhood chain
          </p>
        </div>
        <LiveEventLayer items={liveItems} />
      </div>
    </div>
  );
}

export function CanvasRoot() {
  const { events } = usePublicEvents();
  const maxVisible = useLiveObjectCap();
  const nowMs = useWallClockMs(LIVE_OBJECT_AGE_TICK_MS);
  const [playReady, setPlayReady] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setPlayReady(true));
  }, []);

  const liveItems = useMemo(() => {
    const visible = selectVisibleLiveEvents(events, nowMs, maxVisible);
    return assignSlots(visible);
  }, [events, nowMs, maxVisible]);

  const liveEventIds = useMemo(
    () => liveItems.map((item) => item.event.id),
    [liveItems],
  );

  return (
    <ParticipationProvider>
      <WatchLiveEventPruner eventIds={liveEventIds} />
      {!playReady ? (
        <CanvasShellFallback liveItems={liveItems} />
      ) : (
        <CanvasPlayTree liveItems={liveItems} events={events} nowMs={nowMs} />
      )}
    </ParticipationProvider>
  );
}
