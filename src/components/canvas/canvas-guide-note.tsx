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
    heading: "MOVE AROUND",
    body: "Drag the empty canvas and explore the world.",
  },
  {
    heading: "MOVE THINGS",
    body: "Pick up objects and leave them somewhere else.",
  },
  {
    heading: "LEAVE TEXT",
    body: "Write something directly onto the canvas for everyone to see.",
  },
  {
    heading: "SHARE A CONTRACT",
    body: "Found a Robinhood Chain token worth looking at? Paste its contract address onto the canvas. Anyone here can tap it to copy it.",
  },
  {
    heading: "DRAW",
    body: "Draw directly onto the shared canvas.",
  },
  {
    heading: "SEE PEOPLE LIVE",
    body: "Watch other people around the world type, draw, move things and explore the canvas while you're here.",
  },
  {
    heading: "FOLLOW WHAT'S HAPPENING ON PONS",
    body: "Behind the scenes, 4663 monitors new token launches on the PONS launchpad. We watch for new wallets arriving after a launch and surface the activity we think deserves a closer look, in real time.",
    aside: "This isn't a signal to buy. It's something to investigate.",
  },
  {
    heading: "WATCH",
    body: "When 4663 surfaces a PONS event that interests you, keep it on your watch list while you explore.",
  },
  {
    heading: "PIN",
    body: "Pin an interesting event to the canvas so other people can see it.",
  },
  {
    heading: "SUMMON",
    body: "Bring older events that passed the same 4663 monitoring rules back onto the canvas.",
  },
  {
    heading: "HOME",
    body: "Return your view to the beginning.",
  },
  {
    heading: "RESET",
    body: "Clear the things you've added during your session.",
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
            4663 is a live canvas shared by everyone here.
          </p>

          <ul className="space-y-3">
            {GUIDE_ACTIONS.map((action) => (
              <li key={action.heading}>
                <p className="font-semibold text-neutral-900">
                  {action.heading}
                </p>
                <p className="mt-0.5">{action.body}</p>
                {"aside" in action && action.aside ? (
                  <p className="mt-1 text-neutral-500">{action.aside}</p>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="border-t border-neutral-200 pt-4">
            <p className="font-semibold text-neutral-900">
              NO ACCOUNTS. NO SIGN-UP.
            </p>
            <p className="mt-1">
              Choose a temporary name if you want other people here to know who
              you are. You don&apos;t need to create an account or provide
              personal information to participate.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
