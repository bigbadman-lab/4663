"use client";

/**
 * Ephemeral RADAR canvas alert — Lottie radar + locked copy.
 */

import Lottie from "lottie-react";
import { useEffect, useState } from "react";
import { useInteractiveControlProtection } from "@/components/canvas/use-interactive-control-protection";
import { stopPlayhtmlMoveStart } from "@/lib/canvas/interactive-control";
import type { RadarAlert } from "@/lib/events/radar-alerts";

export const RADAR_ALERT_COPY = {
  title: "JUST HIT OUR RADAR",
  body: "Something on Robinhood Chain caught our attention.",
  cta: "[ TAKE A LOOK ]",
} as const;

export const RADAR_LOTTIE_SRC = "/radar.json" as const;

type RadarAlertObjectProps = {
  alert: RadarAlert;
  onOpen: (tokenAddress: string) => void;
  onDismiss: (eventId: string) => void;
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
  onDismiss,
}: RadarAlertObjectProps) {
  const reducedMotion = usePrefersReducedMotion();
  const animationData = useRadarAnimationData();
  const buttonRef = useInteractiveControlProtection<HTMLButtonElement>();

  return (
    <div
      className="pointer-events-auto absolute z-[16] -translate-x-1/2 -translate-y-1/2 touch-manipulation"
      style={{ left: `${alert.leftPct}%`, top: `${alert.topPct}%` }}
      data-4663-radar-alert
      data-4663-radar-alert-event={alert.eventId}
    >
      <button
        ref={buttonRef}
        type="button"
        className="flex w-[10.5rem] cursor-pointer flex-col items-stretch gap-1.5 border border-neutral-300 bg-white px-2 py-2 text-left shadow-sm transition-colors hover:border-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 sm:w-[11.5rem]"
        aria-label="JUST HIT OUR RADAR — take a look"
        data-4663-radar-alert-open
        onClick={(event) => {
          event.stopPropagation();
          onOpen(alert.tokenAddress);
          onDismiss(alert.eventId);
        }}
        onPointerDown={stopPlayhtmlMoveStart}
        onMouseDown={stopPlayhtmlMoveStart}
        onTouchStart={stopPlayhtmlMoveStart}
      >
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
        <span className="pointer-events-none font-mono text-[10px] tracking-wide text-neutral-500 sm:text-[11px]">
          {RADAR_ALERT_COPY.cta}
        </span>
      </button>
    </div>
  );
}
