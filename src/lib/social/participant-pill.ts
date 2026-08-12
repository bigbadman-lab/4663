/**
 * Social 1C — stable PlayHTML ids + deterministic initial pill positions.
 */

export function playhtmlParticipantElementId(sessionId: string): string {
  return `4663-participant-${sessionId}`;
}

export type ParticipantPillOrigin = {
  leftPct: number;
  topPct: number;
};

/**
 * Safe canvas band for participant pills:
 * - clear top chrome (~ENTER / intro)
 * - clear bottom chrome (presence / clock / palette)
 * - keep away from extreme edges
 */
const LEFT_MIN = 12;
const LEFT_SPAN = 76; // → max 88
const TOP_MIN = 22;
const TOP_SPAN = 48; // → max 70

function hashSessionId(sessionId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < sessionId.length; i += 1) {
    hash ^= sessionId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministic CSS origin for a participant pill.
 * PlayHTML then owns translate offsets from this origin.
 */
export function participantPillOrigin(
  sessionId: string,
): ParticipantPillOrigin {
  const hash = hashSessionId(sessionId);
  const leftPct = LEFT_MIN + (hash % (LEFT_SPAN + 1));
  const topPct = TOP_MIN + ((hash >>> 8) % (TOP_SPAN + 1));
  return { leftPct, topPct };
}
