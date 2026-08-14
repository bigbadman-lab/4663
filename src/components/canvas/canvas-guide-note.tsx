"use client";

/**
 * Practical field guide overlay — what users can do on 4663 (8A.12).
 * Same modal shell as WHAT IS THIS?; mobile overflow matches ENTER (8A.11).
 */

import { useEffect, useId, useRef } from "react";

type CanvasGuideNoteProps = {
  onClose: () => void;
};

const GUIDE_ACTIONS = [
  {
    heading: "EXPLORE THE CANVAS",
    paragraphs: [
      "Move around. Pick things up. Leave text. Draw. Explore what other people have left behind.",
      "The canvas is shared, so what happens here becomes part of the space everyone else is exploring.",
    ],
  },
  {
    heading: "BE HERE WITH EVERYONE",
    paragraphs: [
      "Choose ENTER to give yourself a temporary name.",
      "See who else is here, watch people interact with the canvas and open GLOBAL CHAT to talk to everyone currently exploring 4663.",
      "No account or sign-up required.",
    ],
  },
  {
    heading: "WATCH ROBINHOOD CHAIN",
    paragraphs: [
      "4663 is connected to live onchain data.",
      "We monitor new tokens launched through PONS and surface activity we think is worth looking at.",
      "This isn't a signal to buy. It's something to investigate.",
    ],
  },
  {
    heading: "EXPLORE RADAR",
    paragraphs: [
      "Click RADAR to see tokens currently on our radar — Robinhood Chain launches our PONS continuation model has flagged as potentially worth investigating.",
      "These are surfaced from the live PONS activity 4663 monitors — not signals to buy, but tokens we think deserve a closer look.",
    ],
  },
  {
    heading: "BUILD WITH US",
    paragraphs: [
      "4663 is only getting started.",
      "We're building a canvas where people, onchain data, projects, businesses and new Web3 tools can exist together in one shared space.",
      "The canvas will keep changing.",
      "So will what you can do with it.",
    ],
  },
] as const;

export function CanvasGuideNote({ onClose }: CanvasGuideNoteProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

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

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto overscroll-none bg-neutral-900/25 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pl-[max(0.75rem,env(safe-area-inset-left,0px))] sm:p-6"
      data-4663-guide-backdrop
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onPointerDown={(event) => {
        // Keep canvas pan / empty-create from seeing through the overlay.
        event.stopPropagation();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="pointer-events-auto flex max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] w-full max-w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-y-auto overscroll-contain border border-neutral-300 bg-white px-4 py-4 text-neutral-900 shadow-sm sm:max-h-[min(40rem,calc(100dvh-3rem))] sm:max-w-md sm:px-6 sm:py-6"
        data-4663-guide-note
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
          <h2
            id={titleId}
            className="font-mono text-sm font-semibold tracking-tight"
          >
            WHAT CAN YOU DO?
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-end font-mono text-[11px] tracking-wide text-neutral-400 transition-colors hover:text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 sm:min-h-0 sm:min-w-0"
            aria-label="Close"
            data-4663-guide-close
          >
            [ CLOSE ]
          </button>
        </div>

        <div className="space-y-4 font-mono text-[12px] leading-relaxed tracking-wide text-neutral-600 sm:text-[13px]">
          <p className="font-semibold text-neutral-900">
            4663 is a live canvas shared with everyone here.
          </p>

          <ul className="space-y-3">
            {GUIDE_ACTIONS.map((action) => (
              <li key={action.heading}>
                <p className="font-semibold text-neutral-900">
                  {action.heading}
                </p>
                {action.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="mt-0.5">
                    {paragraph}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
