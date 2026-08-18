"use client";

/**
 * Top-left chrome affordance to open named participation entry.
 */

import { recordTapDebug } from "@/lib/canvas/tap-debug";

type ParticipationEnterTriggerProps = {
  onOpen: () => void;
  label?: string;
};

export function ParticipationEnterTrigger({
  onOpen,
  label = "[ ENTER ]",
}: ParticipationEnterTriggerProps) {
  const handleClick = () => {
    recordTapDebug("handler", "react-onClick", {
      target: "ParticipationEnterTrigger",
      path: "React onClick → onOpen",
    });
    onOpen();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex min-h-11 items-center px-3 font-mono text-[10px] tracking-wide text-[color:var(--canvas-muted,#a3a3a3)] touch-manipulation transition-colors hover:text-[color:var(--canvas-fg,#171717)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 sm:text-[11px]"
      data-4663-participation-enter-trigger
    >
      {label}
    </button>
  );
}
