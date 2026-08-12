/**
 * Named participation controller: sessionStorage identity + Realtime Presence.
 * Injectable for tests — no live Supabase required.
 *
 * Anonymous clients subscribe as observers (no track) so remote pills remain
 * visible. Named clients track; LEAVE untracks but keeps the observer channel.
 */

import {
  clearParticipationSession,
  enterParticipationSession,
  readParticipationSession,
  type StorageLike,
} from "@/lib/social/participation-session";
import type { ParticipationPresenceClient } from "@/lib/social/participation-realtime";
import {
  participantsFromPresenceState,
  presencePayloadFromSession,
} from "@/lib/social/presence-payload";
import {
  notifySessionEnded,
  type SessionEndedContext,
} from "@/lib/social/session-cleanup";
import type {
  ParticipationPresencePayload,
  ParticipationSession,
  ParticipationStatus,
} from "@/lib/social/types";

export type ParticipationControllerDeps = {
  storage: StorageLike;
  presence: ParticipationPresenceClient;
  onSelf: (self: ParticipationSession | null) => void;
  onParticipants: (participants: ParticipationPresencePayload[]) => void;
  onStatus: (status: ParticipationStatus) => void;
  onError?: (error: unknown) => void;
  /** Override for tests; defaults to module sessionCleanupRegistry.notify. */
  onSessionEnded?: (ctx: SessionEndedContext) => void;
  now?: () => Date;
  randomUUID?: () => string;
};

export class ParticipationController {
  private subscription: ReturnType<
    ParticipationPresenceClient["connect"]
  > | null = null;
  private self: ParticipationSession | null = null;
  private participants: ParticipationPresencePayload[] = [];
  private stopped = true;
  private trackGeneration = 0;
  private readonly observerKey: string;
  private readonly onSessionEnded: (ctx: SessionEndedContext) => void;

  constructor(private readonly deps: ParticipationControllerDeps) {
    const randomUUID = deps.randomUUID ?? (() => crypto.randomUUID());
    this.observerKey = randomUUID();
    this.onSessionEnded = deps.onSessionEnded ?? notifySessionEnded;
  }

  getSelf(): ParticipationSession | null {
    return this.self;
  }

  /**
   * Mount: restore sessionStorage identity if valid and connect Presence.
   * Anonymous and named both subscribe; only named tracks.
   */
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;

    const restored = readParticipationSession(this.deps.storage);
    if (!restored) {
      this.self = null;
      this.deps.onSelf(null);
      this.setParticipants([]);
      this.deps.onStatus("anonymous");
      this.connectPresence(null);
      return;
    }

    this.self = restored;
    this.deps.onSelf(restored);
    this.connectPresence(restored);
  }

  /**
   * Enter with a display name: create session, persist, track Presence.
   */
  enter(displayName: string): { ok: true } | { ok: false; error: string } {
    if (this.stopped) {
      return { ok: false, error: "Participation is not active." };
    }

    const created = enterParticipationSession(this.deps.storage, {
      displayName,
      now: this.deps.now,
      randomUUID: this.deps.randomUUID,
    });
    if (!created.ok) return created;

    this.self = created.session;
    this.deps.onSelf(created.session);
    this.connectPresence(created.session);
    return { ok: true };
  }

  /**
   * End named participation for this tab.
   * Untracks Presence, clears sessionStorage, returns to anonymous observer.
   * Keeps the Realtime channel so remote participants remain visible.
   * Does not touch anonymous aggregate presence.
   */
  leave(): void {
    if (this.self === null) return;

    const leftId = this.self.sessionId;
    void this.subscription?.untrack().catch((error) => {
      this.deps.onError?.(error);
    });

    clearParticipationSession(this.deps.storage);
    this.self = null;
    this.deps.onSelf(null);
    this.deps.onStatus("anonymous");
    this.setParticipants(
      this.participants.filter((p) => p.sessionId !== leftId),
    );

    this.onSessionEnded({ reason: "leave", sessionId: leftId });
  }

  /**
   * Unmount: disconnect channel without clearing sessionStorage
   * (same-tab refresh can restore). Does not emit session-ended.
   */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.disconnectPresence();
  }

  private setParticipants(
    next: ParticipationPresencePayload[],
  ): void {
    this.participants = next;
    this.deps.onParticipants(next);
  }

  private disconnectPresence(): void {
    const sub = this.subscription;
    this.subscription = null;
    this.trackGeneration += 1;
    if (sub) {
      void sub.untrack().catch((error) => this.deps.onError?.(error));
      sub.disconnect();
    }
  }

  /**
   * @param session — when set, track after SUBSCRIBED; when null, observe only.
   */
  private connectPresence(session: ParticipationSession | null): void {
    this.disconnectPresence();
    this.deps.onStatus(session ? "connecting" : "anonymous");
    const generation = ++this.trackGeneration;
    const presenceKey = session
      ? session.sessionId
      : `obs-${this.observerKey}`;
    const trackPayload = session
      ? presencePayloadFromSession(session)
      : null;

    this.subscription = this.deps.presence.connect({
      presenceKey,
      handlers: {
        onSync: (state) => {
          if (this.stopped || generation !== this.trackGeneration) return;
          this.setParticipants(participantsFromPresenceState(state));
        },
        onStatus: (status) => {
          if (this.stopped || generation !== this.trackGeneration) return;
          if (status === "SUBSCRIBED") {
            if (trackPayload) {
              this.deps.onStatus("live");
              void this.subscription
                ?.track(trackPayload)
                .catch((error) => this.deps.onError?.(error));
            } else {
              this.deps.onStatus("anonymous");
            }
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            this.deps.onStatus("error");
            return;
          }
          if (status === "CLOSED") {
            // Reconnect uses same session identity — do not mint a new one.
            this.deps.onStatus(this.self ? "connecting" : "anonymous");
          }
        },
      },
    });
  }
}
