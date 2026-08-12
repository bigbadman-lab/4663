"use client";

/**
 * Renders one movable presence pill per named realtime participant.
 * Mount only under PlayProvider + ParticipationProvider.
 */

import { ParticipantPill } from "@/components/social/participant-pill";
import { useParticipation } from "@/lib/social/use-participation";

export function ParticipantPresenceLayer() {
  const { participants, self } = useParticipation();

  if (participants.length === 0) return null;

  return (
    <div className="absolute inset-0" data-4663-participant-layer>
      {participants.map((participant) => (
        <ParticipantPill
          key={participant.sessionId}
          participant={participant}
          isSelf={self?.sessionId === participant.sessionId}
        />
      ))}
    </div>
  );
}
