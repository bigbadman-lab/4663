"use client";

/**
 * Movable PlayHTML 4663 logo object.
 * Outer element owns PlayHTML transform; inner wrapper owns clip/size.
 */

import { CanMoveElement } from "@playhtml/react";
import Image from "next/image";
import {
  LOGO_DEFAULT_STYLE,
  PLAYHTML_CANVAS_BOUNDS_ID,
  PLAYHTML_LOGO_ID,
} from "@/lib/canvas/hero";

export function MovableLogo() {
  return (
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
      <div
        id={PLAYHTML_LOGO_ID}
        className="pointer-events-auto absolute z-[15] cursor-grab touch-manipulation select-none active:cursor-grabbing"
        style={LOGO_DEFAULT_STYLE}
        data-4663-logo
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
    </CanMoveElement>
  );
}
