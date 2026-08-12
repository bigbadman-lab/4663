"use client";

/**
 * Quiet chrome indicator for the local named participant (no pill yet).
 */

type ParticipationSelfBadgeProps = {
  name: string;
  colour: string;
};

export function ParticipationSelfBadge({
  name,
  colour,
}: ParticipationSelfBadgeProps) {
  return (
    <p
      className="font-mono text-[10px] tracking-wide text-neutral-500 sm:text-[11px]"
      data-4663-participation-self
      title="Named for this session only"
    >
      <span style={{ color: colour }}>[ {name} ]</span>
    </p>
  );
}
