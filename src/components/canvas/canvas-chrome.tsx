"use client";

/**
 * Fixed canvas chrome: brand anchors + intro/guide (top-right),
 * hero-area participation, presence + clock footer.
 * Outside PlayHTML / camera world — never movable.
 */

import { useCallback, useState } from "react";
import { BrandAnchors } from "@/components/canvas/brand-anchors";
import { CanvasGuideNote } from "@/components/canvas/canvas-guide-note";
import { CanvasGuideTrigger } from "@/components/canvas/canvas-guide-trigger";
import { CanvasIntroNote } from "@/components/canvas/canvas-intro-note";
import { CanvasIntroTrigger } from "@/components/canvas/canvas-intro-trigger";
import { CanvasLiveClock } from "@/components/canvas/canvas-live-clock";
import { CanvasToneControl } from "@/components/canvas/canvas-tone-control";
import { ParticipationEnterForm } from "@/components/social/participation-enter-form";
import { ParticipationEnterTrigger } from "@/components/social/participation-enter-trigger";
import { ParticipationSessionControl } from "@/components/social/participation-session-control";
import { PresenceStatus } from "@/components/presence-status";
import { PARTICIPATION_CONTROL_DEFAULT_STYLE } from "@/lib/canvas/hero";
import { useParticipation } from "@/lib/social/use-participation";

/** At most one information modal open (WHAT IS THIS? / WHAT CAN YOU DO?). */
type InfoModal = null | "intro" | "guide";

export function CanvasChrome() {
  const [infoModal, setInfoModal] = useState<InfoModal>(null);
  const [enterOpen, setEnterOpen] = useState(false);
  const closeInfo = useCallback(() => setInfoModal(null), []);
  const openIntro = useCallback(() => setInfoModal("intro"), []);
  const openGuide = useCallback(() => setInfoModal("guide"), []);
  const closeEnter = useCallback(() => setEnterOpen(false), []);
  const openEnter = useCallback(() => setEnterOpen(true), []);
  const { self, isParticipating, enter, leave } = useParticipation();

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 z-20"
        data-4663-canvas-chrome
      >
        <BrandAnchors />

        <div
          className="pointer-events-auto absolute -translate-x-1/2 text-center"
          style={PARTICIPATION_CONTROL_DEFAULT_STYLE}
          data-4663-chrome-participation
        >
          {isParticipating && self ? (
            <ParticipationSessionControl
              name={self.displayName}
              colour={self.colour}
              onLeave={leave}
            />
          ) : (
            <ParticipationEnterTrigger onOpen={openEnter} />
          )}
        </div>

        <div
          className="pointer-events-auto absolute top-5 right-5 flex flex-col items-end gap-1 sm:top-6 sm:right-6"
          data-4663-chrome-top-right
        >
          <CanvasToneControl />
          <CanvasIntroTrigger onOpen={openIntro} />
          <CanvasGuideTrigger onOpen={openGuide} />
        </div>

        <div
          className="pointer-events-auto absolute bottom-5 left-5 max-w-[min(16rem,calc(50%-0.75rem))] sm:bottom-6 sm:left-6 sm:max-w-[16rem]"
          data-4663-chrome-presence
        >
          <PresenceStatus />
        </div>

        <div
          className="pointer-events-none absolute bottom-5 right-5 max-w-[min(14rem,calc(50%-0.75rem))] text-right sm:bottom-6 sm:right-6"
          data-4663-chrome-clock
        >
          <CanvasLiveClock />
        </div>
      </div>

      {infoModal === "intro" ? <CanvasIntroNote onClose={closeInfo} /> : null}
      {infoModal === "guide" ? <CanvasGuideNote onClose={closeInfo} /> : null}
      {enterOpen && !isParticipating ? (
        <ParticipationEnterForm onClose={closeEnter} onEnter={enter} />
      ) : null}
    </>
  );
}
