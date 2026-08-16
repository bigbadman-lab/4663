"use client";

/**
 * Top-right guide trigger — practical interaction help (8A.12).
 * Sibling of WHAT IS THIS?; same chrome styling.
 */

type CanvasGuideTriggerProps = {
  onOpen: () => void;
};

export function CanvasGuideTrigger({ onOpen }: CanvasGuideTriggerProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="font-mono text-[10px] tracking-wide text-[color:var(--canvas-muted,#a3a3a3)] touch-manipulation transition-colors hover:text-[color:var(--canvas-fg,#171717)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 sm:text-[11px]"
      data-4663-guide-trigger
    >
      [ WHAT CAN YOU DO? ]
    </button>
  );
}
