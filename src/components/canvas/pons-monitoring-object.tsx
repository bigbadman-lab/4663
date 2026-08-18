"use client";

/**
 * Single persistent RADAR object (continuation watchlist).
 *
 * Centering translate lives on the PlayHTML host so the hittable box matches
 * the visible card. Only the header strip starts a move; OPEN is isolated.
 */

import Image from "next/image";
import { PlayhtmlMoveHitFill } from "@/components/canvas/playhtml-move-hit-fill";
import { PonsMonitoringPanel } from "@/components/canvas/pons-monitoring-panel";
import { usePonsMonitoringPanelOpen } from "@/components/canvas/pons-monitoring-panel-state";
import { useContinuationWatchlist } from "@/components/canvas/use-continuation-watchlist";
import { useInteractiveControlProtection } from "@/components/canvas/use-interactive-control-protection";
import { stopPlayhtmlMoveStart } from "@/lib/canvas/interactive-control";

/** Stable PlayHTML / DOM id for the single monitoring host. */
export const PONS_MONITORING_ELEMENT_ID = "4663-pons-monitoring" as const;

/** Default home-region CSS origin (viewport % within home artboard). */
export const PONS_MONITORING_DEFAULT_STYLE = {
  left: "22%",
  top: "32%",
} as const;

export type PonsMonitoringObjectProps = {
  /** When true, host classes match PlayHTML movable chrome. */
  movableChrome?: boolean;
};

export function ponsMonitoringHostClassName(movableChrome: boolean): string {
  return movableChrome
    ? "pointer-events-auto absolute z-[15] -translate-x-1/2 -translate-y-1/2 touch-manipulation select-none"
    : "absolute z-[15] -translate-x-1/2 -translate-y-1/2 select-none";
}

export function PonsMonitoringContent() {
  const { tokens } = useContinuationWatchlist();
  const {
    open,
    selectedTokenAddress,
    selectedLaunchpad,
    openPanel,
    closePanel,
    clearSelectedToken,
  } = usePonsMonitoringPanelOpen();
  const openRef = useInteractiveControlProtection<HTMLButtonElement>();
  const bodyRef = useInteractiveControlProtection<HTMLDivElement>();
  const count = tokens.length;
  const statusLabel = count === 0 ? "SCANNING" : `${count} ON RADAR`;

  return (
    <>
      <article
        className="relative flex min-w-[11rem] max-w-[13rem] flex-col items-stretch border border-neutral-300 bg-white"
        data-4663-pons-monitoring-card
        data-4663-radar-card
      >
        <PlayhtmlMoveHitFill />
        <div
          className="relative z-[1] flex cursor-grab flex-col items-stretch gap-2 px-2.5 pt-2 active:cursor-grabbing"
          data-4663-pons-monitoring-header
          data-4663-pons-monitoring-drag
          data-4663-playhtml-drag-handle="true"
        >
          <Image
            src="/pons.png"
            alt=""
            width={160}
            height={80}
            className="pointer-events-none relative h-auto w-full object-contain"
            draggable={false}
            priority
          />
          <span className="pointer-events-none relative font-mono text-[10px] leading-snug tracking-wide text-neutral-800 sm:text-[11px]">
            ROBINHOOD CHAIN
            <br />
            ON OUR RADAR
          </span>
        </div>
        <div
          ref={bodyRef}
          className="relative z-[1] flex flex-col items-stretch gap-2 px-2.5 pb-2 pt-2"
          data-4663-pons-monitoring-body
          onPointerDown={stopPlayhtmlMoveStart}
          onMouseDown={stopPlayhtmlMoveStart}
          onTouchStart={stopPlayhtmlMoveStart}
        >
          <span
            className="pointer-events-none relative font-mono text-[10px] tracking-wide text-neutral-500"
            data-4663-pons-monitoring-status
            data-4663-pons-monitoring-count={count}
          >
            {statusLabel}
          </span>
          <button
            ref={openRef}
            type="button"
            className="relative z-[1] inline-flex min-h-11 w-full items-center justify-center font-mono text-[10px] tracking-wide text-[color:var(--canvas-muted,#a3a3a3)] touch-manipulation transition-colors hover:text-[color:var(--canvas-fg,#171717)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 sm:text-[11px]"
            data-4663-pons-monitoring-open
            aria-label="Open RADAR"
            onClick={(event) => {
              event.stopPropagation();
              openPanel();
            }}
            onPointerDown={stopPlayhtmlMoveStart}
            onMouseDown={stopPlayhtmlMoveStart}
            onTouchStart={stopPlayhtmlMoveStart}
          >
            [ OPEN ]
          </button>
        </div>
      </article>

      {open ? (
        <PonsMonitoringPanel
          tokens={tokens}
          initialTokenAddress={selectedTokenAddress}
          initialLaunchpad={selectedLaunchpad}
          onClearSelection={clearSelectedToken}
          onClose={closePanel}
        />
      ) : null}
    </>
  );
}

/** Static (non-PlayHTML) host for fallback shell. */
export function PonsMonitoringObject({
  movableChrome = false,
}: PonsMonitoringObjectProps) {
  return (
    <div
      id={PONS_MONITORING_ELEMENT_ID}
      className={ponsMonitoringHostClassName(movableChrome)}
      style={PONS_MONITORING_DEFAULT_STYLE}
      data-4663-pons-monitoring
    >
      <PonsMonitoringContent />
    </div>
  );
}
