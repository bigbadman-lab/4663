"use client";

/**
 * Fixed canvas chrome: intro (top-right), participation enter (top-left),
 * presence + clock footer. Outside PlayHTML — never movable.
 */

import { useCallback, useState } from "react";
import { CanvasIntroNote } from "@/components/canvas/canvas-intro-note";
import { CanvasIntroTrigger } from "@/components/canvas/canvas-intro-trigger";
import { CanvasLiveClock } from "@/components/canvas/canvas-live-clock";
import { ParticipationEnterForm } from "@/components/social/participation-enter-form";
import { ParticipationEnterTrigger } from "@/components/social/participation-enter-trigger";
import { ParticipationSelfBadge } from "@/components/social/participation-self-badge";
import { PresenceStatus } from "@/components/presence-status";
import { useParticipation } from "@/lib/social/use-participation";

export function CanvasChrome() {
  const [introOpen, setIntroOpen] = useState(false);
  const [enterOpen, setEnterOpen] = useState(false);
  const closeIntro = useCallback(() => setIntroOpen(false), []);
  const openIntro = useCallback(() => setIntroOpen(true), []);
  const closeEnter = useCallback(() => setEnterOpen(false), []);
  const openEnter = useCallback(() => setEnterOpen(true), []);
  const { self, isParticipating, enter } = useParticipation();

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 z-20"
        data-4663-canvas-chrome
      >
        <div
          className="pointer-events-auto absolute top-5 left-5 sm:top-6 sm:left-6"
          data-4663-chrome-participation
        >
          {isParticipating && self ? (
            <ParticipationSelfBadge
              name={self.displayName}
              colour={self.colour}
            />
          ) : (
            <ParticipationEnterTrigger onOpen={openEnter} />
          )}
        </div>

        <div className="pointer-events-auto absolute top-5 right-5 sm:top-6 sm:right-6">
          <CanvasIntroTrigger onOpen={openIntro} />
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

      {introOpen ? <CanvasIntroNote onClose={closeIntro} /> : null}
      {enterOpen && !isParticipating ? (
        <ParticipationEnterForm onClose={closeEnter} onEnter={enter} />
      ) : null}
    </>
  );
}
