"use client";

/**
 * Top-right legal trigger — sibling of WHAT IS THIS? / WHAT CAN YOU DO?
 */

type CanvasLegalTriggerProps = {
  onOpen: () => void;
};

export function CanvasLegalTrigger({ onOpen }: CanvasLegalTriggerProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="pointer-events-auto font-mono text-[10px] tracking-wide text-[color:var(--canvas-muted,#a3a3a3)] touch-manipulation transition-colors hover:text-[color:var(--canvas-fg,#171717)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 sm:text-[11px]"
      data-4663-legal-trigger
    >
      [ LEGAL ]
    </button>
  );
}
