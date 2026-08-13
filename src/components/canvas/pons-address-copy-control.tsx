"use client";

/**
 * Short address + copy affordance for PONS activity cards.
 * Also reused inline inside published user TEXT (Stage 8A.10).
 */

import { formatShortAddress } from "@/lib/canvas/format-address";

function CopyGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="11"
      height="11"
      aria-hidden
      className="pointer-events-none shrink-0 opacity-70"
      data-4663-copy-glyph
    >
      <rect
        x="5.5"
        y="5.5"
        width="8"
        height="8"
        rx="1.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <rect
        x="2.5"
        y="2.5"
        width="8"
        height="8"
        rx="1.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
    </svg>
  );
}

export type PonsAddressCopyControlProps = {
  tokenAddress: string;
  onCopy: () => void;
  stopMoveStart?: (event: { stopPropagation(): void }) => void;
  /**
   * `block` — PONS card row (default).
   * `inline` — embedded in free-flow TEXT; same type/hover/glyph, no full-width row.
   */
  variant?: "block" | "inline";
};

const BLOCK_CLASS =
  "mt-1.5 flex w-full cursor-pointer touch-manipulation items-center gap-1.5 text-left text-[11px] text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline";

const INLINE_CLASS =
  "mx-0.5 inline-flex max-w-full cursor-pointer touch-manipulation items-center gap-1 align-baseline text-[11px] text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline";

export function PonsAddressCopyControl({
  tokenAddress,
  onCopy,
  stopMoveStart,
  variant = "block",
}: PonsAddressCopyControlProps) {
  const isInline = variant === "inline";
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onCopy();
      }}
      onPointerDown={stopMoveStart}
      onMouseDown={stopMoveStart}
      onTouchStart={stopMoveStart}
      className={isInline ? INLINE_CLASS : BLOCK_CLASS}
      aria-label={`Copy token address ${tokenAddress}`}
      data-4663-event-address
      data-4663-address-variant={variant}
    >
      <span className="min-w-0 truncate">{formatShortAddress(tokenAddress)}</span>
      <CopyGlyph />
    </button>
  );
}
