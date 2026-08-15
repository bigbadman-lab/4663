"use client";

/**
 * Ephemeral RADAR canvas alert — Lottie radar + locked copy.
 * PlayHTML-movable host; only [ TAKE A LOOK ] opens token detail.
 */

import { CanMoveElement } from "@playhtml/react";
import Lottie from "lottie-react";
import { useEffect, useState } from "react";
import { useInteractiveControlProtection } from "@/components/canvas/use-interactive-control-protection";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/hero";
import { stopPlayhtmlMoveStart } from "@/lib/canvas/interactive-control";
import type { RadarAlert } from "@/lib/events/radar-alerts";

export const RADAR_ALERT_COPY = {
  title: "JUST HIT OUR RADAR",
  body: "Something on Robinhood Chain caught our attention.",
  cta: "[ TAKE A LOOK ]",
} as const;

export const RADAR_LOTTIE_SRC = "/radar.json" as const;

/** Stable PlayHTML / DOM id for a live RADAR alert host. */
export function playhtmlRadarAlertElementId(eventId: string): string {
  return `4663-radar-alert-${eventId}`;
}

type RadarAlertObjectProps = {
  alert: RadarAlert;
  onOpen: (tokenAddress: string) => void;
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
}

function useRadarAnimationData(): object | null {
  const [data, setData] = useState<object | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch(RADAR_LOTTIE_SRC)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json && typeof json === "object") setData(json);
      })
      .catch(() => {
        /* keep null — static fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}

export function RadarAlertObject({
  alert,
  onOpen,
}: RadarAlertObjectProps) {
  const reducedMotion = usePrefersReducedMotion();
  const animationData = useRadarAnimationData();
  const ctaRef = useInteractiveControlProtection<HTMLButtonElement>();

  return (
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
      <div
        id={playhtmlRadarAlertElementId(alert.eventId)}
        className="pointer-events-auto absolute z-[16] cursor-grab touch-manipulation select-none active:cursor-grabbing"
        style={{ left: `${alert.leftPct}%`, top: `${alert.topPct}%` }}
        data-4663-radar-alert
        data-4663-radar-alert-event={alert.eventId}
      >
        <article className="-translate-x-1/2 -translate-y-1/2 flex w-[10.5rem] flex-col items-stretch gap-1.5 border border-neutral-300 bg-white px-2 py-2 shadow-sm sm:w-[11.5rem]">
          <div
            className="pointer-events-none mx-auto h-[5.5rem] w-[5.5rem] sm:h-[6.5rem] sm:w-[6.5rem]"
            data-4663-radar-lottie
            aria-hidden
          >
            {animationData ? (
              <Lottie
                animationData={animationData}
                loop={!reducedMotion}
                autoplay={!reducedMotion}
                style={{ width: "100%", height: "100%" }}
                rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-mono text-[10px] text-neutral-400">
                RADAR
              </div>
            )}
          </div>
          <span className="pointer-events-none font-mono text-[10px] font-semibold leading-snug tracking-wide text-neutral-900 sm:text-[11px]">
            {RADAR_ALERT_COPY.title}
          </span>
          <span className="pointer-events-none font-mono text-[10px] leading-snug tracking-wide text-neutral-600">
            {RADAR_ALERT_COPY.body}
          </span>
          <button
            ref={ctaRef}
            type="button"
            className="inline-flex min-h-11 w-full items-center justify-center touch-manipulation font-mono text-[10px] tracking-wide text-[color:var(--canvas-muted,#a3a3a3)] transition-colors hover:text-[color:var(--canvas-fg,#171717)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 sm:text-[11px]"
            aria-label="JUST HIT OUR RADAR — take a look"
            data-4663-radar-alert-open
            onClick={(event) => {
              event.stopPropagation();
              onOpen(alert.tokenAddress);
            }}
            onPointerDown={stopPlayhtmlMoveStart}
            onMouseDown={stopPlayhtmlMoveStart}
            onTouchStart={stopPlayhtmlMoveStart}
          >
            {RADAR_ALERT_COPY.cta}
          </button>
        </article>
      </div>
    </CanMoveElement>
  );
}
