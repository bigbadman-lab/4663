"use client";

/**
 * LAUNCH1 — fixed top-right OFFICIAL CONTRACT copy control.
 * Viewport chrome only — not PlayHTML, not world, not draggable.
 */

import { useState } from "react";
import { useInteractiveControlProtection } from "@/components/canvas/use-interactive-control-protection";
import { copyTextQuiet } from "@/lib/canvas/clipboard";
import { stopPlayhtmlMoveStart } from "@/lib/canvas/interactive-control";
import { OFFICIAL_CONTRACT_COPIED_MS } from "@/lib/token/official";

type OfficialContractControlProps = {
  contractAddress: string;
};

export function OfficialContractControl({
  contractAddress,
}: OfficialContractControlProps) {
  const [copied, setCopied] = useState(false);
  const ref = useInteractiveControlProtection<HTMLButtonElement>();

  const onCopy = async () => {
    const ok = await copyTextQuiet(contractAddress);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), OFFICIAL_CONTRACT_COPIED_MS);
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void onCopy();
      }}
      onPointerDown={stopPlayhtmlMoveStart}
      onMouseDown={stopPlayhtmlMoveStart}
      onTouchStart={stopPlayhtmlMoveStart}
      className="font-mono text-[10px] tracking-wide text-[color:var(--canvas-muted,#a3a3a3)] transition-colors hover:text-[color:var(--canvas-fg,#171717)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 sm:text-[11px]"
      aria-label="Copy official 4663 token contract"
      data-4663-official-contract
    >
      {copied ? "[ COPIED ]" : "[ OFFICIAL CONTRACT ]"}
    </button>
  );
}
