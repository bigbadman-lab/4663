"use client";

/**
 * Lightweight editorial note overlay explaining 4663.
 */

import { useEffect, useId, useRef } from "react";

type CanvasIntroNoteProps = {
  onClose: () => void;
};

export function CanvasIntroNote({ onClose }: CanvasIntroNoteProps) {
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
      className="fixed inset-0 z-30 flex items-center justify-center bg-neutral-900/25 p-4 sm:p-6"
      data-4663-intro-backdrop
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="pointer-events-auto w-full max-w-sm border border-neutral-300 bg-white px-5 py-5 text-neutral-900 shadow-sm sm:max-w-md sm:px-6 sm:py-6"
        data-4663-intro-note
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2
            id={titleId}
            className="font-mono text-sm font-semibold tracking-tight"
          >
            4663
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="font-mono text-[11px] tracking-wide text-neutral-400 transition-colors hover:text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
            aria-label="Close"
            data-4663-intro-close
          >
            [ CLOSE ]
          </button>
        </div>
        <div className="space-y-3 font-mono text-[12px] leading-relaxed tracking-wide text-neutral-600 sm:text-[13px]">
          <p className="font-semibold text-neutral-900">
            4663 is a canvas for the internet with Web3 tools built in.
          </p>
          <p>
            A shared, live space where anyone can write, draw, move things, chat
            and interact with people around the world. No accounts. No sign-ups.
          </p>
          <p>The canvas is also connected to Robinhood Chain.</p>
          <p>
            4663 watches the chain in real time, monitors every new token
            launched through PONS, and surfaces activity we think is worth
            looking at.
          </p>
          <p>But this is only the beginning.</p>
          <p>
            We&apos;re building 4663 as an open internet canvas where people,
            onchain data, projects, businesses and the 4663 ecosystem can exist
            together in one live space.
          </p>
          <p>Part canvas. Part network. Part machine.</p>
          <p className="font-semibold text-neutral-900">Welcome to 4663.</p>
        </div>
      </div>
    </div>
  );
}
