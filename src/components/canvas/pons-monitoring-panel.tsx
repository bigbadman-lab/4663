"use client";

/**
 * Lightweight panel listing today's continuation-qualified tokens.
 */

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { robinhoodChainTokenExplorerUrl } from "@/lib/canvas/blockscout";
import { formatShortAddress } from "@/lib/canvas/format-address";
import { formatRelativeTimeAgo } from "@/lib/canvas/format-relative-time";
import {
  continuationWhyCopy,
  type ContinuationWatchlistToken,
} from "@/lib/events/continuation-watchlist";

type PonsMonitoringPanelProps = {
  tokens: readonly ContinuationWatchlistToken[];
  onClose: () => void;
  nowMs?: number;
};

export function PonsMonitoringPanel({
  tokens,
  onClose,
  nowMs,
}: PonsMonitoringPanelProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [clockMs, setClockMs] = useState(0);

  useEffect(() => {
    queueMicrotask(() => {
      setMounted(true);
      setClockMs(nowMs ?? Date.now());
    });
  }, [nowMs]);

  const relativeNow = nowMs ?? clockMs;
  useEffect(() => {
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus();
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto overscroll-none bg-neutral-900/25 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pl-[max(0.75rem,env(safe-area-inset-left,0px))] sm:p-6"
      data-4663-pons-monitoring-backdrop
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="pointer-events-auto flex max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] w-full max-w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-y-auto overscroll-contain border border-neutral-300 bg-white px-4 py-4 text-neutral-900 shadow-sm sm:max-h-[min(40rem,calc(100dvh-3rem))] sm:max-w-md sm:px-6 sm:py-6"
        data-4663-pons-monitoring-panel
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2
            id={titleId}
            className="font-mono text-sm font-semibold tracking-tight"
          >
            TOKENS WE&apos;RE MONITORING
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-end font-mono text-[11px] tracking-wide text-neutral-400 transition-colors hover:text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
            aria-label="Close"
            data-4663-pons-monitoring-close
          >
            [ CLOSE ]
          </button>
        </div>

        {tokens.length === 0 ? (
          <p
            className="font-mono text-[12px] leading-relaxed tracking-wide text-neutral-600 sm:text-[13px]"
            data-4663-pons-monitoring-empty
          >
            Nothing has crossed our continuation signal today yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-4" data-4663-pons-monitoring-list>
            {tokens.map((token) => (
              <li
                key={token.tokenAddress}
                className="border-t border-neutral-200 pt-3 first:border-t-0 first:pt-0"
                data-4663-pons-monitoring-item={token.tokenAddress}
              >
                <p className="font-mono text-[10px] tracking-wide text-neutral-400">
                  TOKEN / ADDRESS
                </p>
                <a
                  href={robinhoodChainTokenExplorerUrl(token.tokenAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-flex min-h-11 items-center font-mono text-[12px] tracking-wide text-neutral-800 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
                  data-4663-pons-monitoring-explorer
                >
                  {formatShortAddress(token.tokenAddress)}
                </a>

                {token.launchTimestamp ? (
                  <p className="mt-2 font-mono text-[11px] tracking-wide text-neutral-500">
                    LAUNCHED{" "}
                    <span className="text-neutral-800">
                      {formatRelativeTimeAgo(token.launchTimestamp, relativeNow)}
                    </span>
                  </p>
                ) : null}

                <p className="mt-1 font-mono text-[11px] tracking-wide text-neutral-500">
                  CONTINUATION{" "}
                  <span className="text-neutral-800">
                    {token.continuationBuyerCount} new first buyers
                  </span>
                </p>

                <p className="mt-2 font-mono text-[10px] tracking-wide text-neutral-400">
                  WHY IT&apos;S HERE
                </p>
                <p className="mt-0.5 font-mono text-[11px] leading-snug tracking-wide text-neutral-600">
                  {continuationWhyCopy(token.continuationBuyerCount)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}
