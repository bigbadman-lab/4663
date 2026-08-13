/**
 * Social 1B — ephemeral named participation types.
 *
 * sessionId in presence metadata is a client claim, not authentication.
 * Later destructive actions must add server-side capability validation.
 */

/** Public ephemeral presence fields only (Realtime Presence metadata). */
export type ParticipationPresencePayload = {
  sessionId: string;
  name: string;
  colour: string;
  joinedAt: string;
  /** Session-bound WATCH set — ephemeral Presence only. */
  watchedEventIds: string[];
};

/** Tab-scoped named participation identity (sessionStorage). */
export type ParticipationSession = {
  sessionId: string;
  displayName: string;
  colour: string;
  joinedAt: string;
};

/**
 * Explicit trust boundary for future mutation APIs.
 * Social 1B does not issue capability tokens.
 */
export type ParticipationClientClaim = {
  /** Untrusted client-claimed participation session id. */
  claimedSessionId: string;
};

export type ParticipationStatus =
  | "anonymous"
  | "connecting"
  | "live"
  | "error";

export type DisplayNameValidationResult =
  | { ok: true; name: string }
  | { ok: false; error: string };
