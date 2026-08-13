"use client";

/**
 * Canonical brand logo (IC3.9).
 *
 * Local launch anchor — not a PlayHTML `can-move` target.
 * Shared movement of PONS / TEXT / DRAW / Summon is unchanged.
 */

import Image from "next/image";
import { LOGO_DEFAULT_STYLE, PLAYHTML_LOGO_ID } from "@/lib/canvas/hero";

export function MovableLogo() {
  return (
    <div
      id={PLAYHTML_LOGO_ID}
      className="pointer-events-none absolute z-[15] select-none"
      style={LOGO_DEFAULT_STYLE}
      data-4663-logo
      data-4663-brand-anchor="logo"
    >
      <div className="h-16 w-16 overflow-hidden rounded-[16px] sm:h-[72px] sm:w-[72px] sm:rounded-[18px]">
        <Image
          src="/4663pfp.png"
          alt="4663"
          width={72}
          height={72}
          className="pointer-events-none h-full w-full object-cover"
          draggable={false}
          priority
        />
      </div>
    </div>
  );
}
