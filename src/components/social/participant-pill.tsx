"use client";

/**
 * Movable named-participant presence pill.
 * CanMoveElement requires a direct DOM host child.
 *
 * Ownership: self is draggable; remotes stay in CanMoveElement for Yjs
 * transform sync but use pointer-events-none so they are not locally draggable.
 * CanMoveElement has no readOnly prop in playhtml@2.14.1 / @playhtml/react.
 */

import { CanMoveElement } from "@playhtml/react";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/hero";
import {
  participantPillOrigin,
  playhtmlParticipantElementId,
} from "@/lib/social/participant-pill";
import type { ParticipationPresencePayload } from "@/lib/social/types";

export type ParticipantPillProps = {
  participant: ParticipationPresencePayload;
  isSelf: boolean;
};

export function ParticipantPill({
  participant,
  isSelf,
}: ParticipantPillProps) {
  const { sessionId, name, colour } = participant;
  const origin = participantPillOrigin(sessionId);
  const hostClassName = isSelf
    ? "absolute z-[17] cursor-grab touch-manipulation select-none active:cursor-grabbing"
    : "absolute z-[17] pointer-events-none select-none";

  return (
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
      <div
        id={playhtmlParticipantElementId(sessionId)}
        className={hostClassName}
        style={{ left: `${origin.leftPct}%`, top: `${origin.topPct}%` }}
        data-4663-participant={sessionId}
        data-4663-participant-self={isSelf ? "true" : "false"}
      >
        <p
          className="-translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[11px] font-medium tracking-wide sm:text-[12px]"
          style={{ color: colour }}
          data-4663-participant-label
        >
          [ {name} ]
        </p>
      </div>
    </CanMoveElement>
  );
}
