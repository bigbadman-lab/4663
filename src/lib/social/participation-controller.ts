/**
 * Named participation controller: sessionStorage identity + Realtime Presence.
 * Injectable for tests — no live Supabase required.
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
  now?: () => Date;
  randomUUID?: () => string;
};

export class ParticipationController {
  private subscription: ReturnType<
    ParticipationPresenceClient["connect"]
  > | null = null;
  private self: ParticipationSession | null = null;
  private stopped = true;
  private trackGeneration = 0;

  constructor(private readonly deps: ParticipationControllerDeps) {}

  getSelf(): ParticipationSession | null {
    return this.self;
  }

  /**
   * Mount: restore sessionStorage identity if valid and connect Presence.
   * Invalid stored identity → anonymous.
   */
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;

    const restored = readParticipationSession(this.deps.storage);
    if (!restored) {
      this.self = null;
      this.deps.onSelf(null);
      this.deps.onParticipants([]);
      this.deps.onStatus("anonymous");
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

    this.disconnectPresence();
    this.self = created.session;
    this.deps.onSelf(created.session);
    this.connectPresence(created.session);
    return { ok: true };
  }

  /**
   * Local leave/clear primitive for Social 1D.
   * Untracks, unsubscribes, clears sessionStorage, returns to anonymous.
   */
  leave(): void {
    const sub = this.subscription;
    this.subscription = null;
    this.trackGeneration += 1;

    if (sub) {
      void sub.untrack().catch((error) => this.deps.onError?.(error));
      sub.disconnect();
    }

    clearParticipationSession(this.deps.storage);
    this.self = null;
    this.deps.onSelf(null);
    this.deps.onParticipants([]);
    this.deps.onStatus("anonymous");
  }

  /**
   * Unmount: disconnect channel without clearing sessionStorage
   * (same-tab refresh can restore).
   */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.disconnectPresence();
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

  private connectPresence(session: ParticipationSession): void {
    this.disconnectPresence();
    this.deps.onStatus("connecting");
    const generation = ++this.trackGeneration;
    const payload = presencePayloadFromSession(session);

    this.subscription = this.deps.presence.connect({
      presenceKey: session.sessionId,
      handlers: {
        onSync: (state) => {
          if (this.stopped || generation !== this.trackGeneration) return;
          this.deps.onParticipants(participantsFromPresenceState(state));
        },
        onStatus: (status) => {
          if (this.stopped || generation !== this.trackGeneration) return;
          if (status === "SUBSCRIBED") {
            this.deps.onStatus("live");
            void this.subscription
              ?.track(payload)
              .catch((error) => this.deps.onError?.(error));
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            this.deps.onStatus("error");
            return;
          }
          if (status === "CLOSED") {
            // Reconnect uses same session identity — do not mint a new one.
            this.deps.onStatus("connecting");
          }
        },
      },
    });
  }
}
