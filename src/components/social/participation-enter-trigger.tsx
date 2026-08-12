"use client";

/**
 * Top-left chrome affordance to open named participation entry.
 */

type ParticipationEnterTriggerProps = {
  onOpen: () => void;
  label?: string;
};

export function ParticipationEnterTrigger({
  onOpen,
  label = "[ ENTER ]",
}: ParticipationEnterTriggerProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="font-mono text-[10px] tracking-wide text-neutral-400 transition-colors hover:text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 sm:text-[11px]"
      data-4663-participation-enter-trigger
    >
      {label}
    </button>
  );
}
