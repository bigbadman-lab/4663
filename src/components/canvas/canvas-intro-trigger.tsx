"use client";

/**
 * Top-right intro trigger for the canvas chrome note.
 */

type CanvasIntroTriggerProps = {
  onOpen: () => void;
};

export function CanvasIntroTrigger({ onOpen }: CanvasIntroTriggerProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="font-mono text-[10px] tracking-wide text-[color:var(--canvas-muted,#a3a3a3)] touch-manipulation transition-colors hover:text-[color:var(--canvas-fg,#171717)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 sm:text-[11px]"
      data-4663-intro-trigger
    >
      [ WHAT IS THIS? ]
    </button>
  );
}
