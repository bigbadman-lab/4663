/**
 * Social 1B/1D — participation controller with mocked Realtime Presence.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { colourFromSessionId } from "@/lib/social/colour";
import { ParticipationController } from "@/lib/social/participation-controller";
import {
  PARTICIPATION_SESSION_STORAGE_KEY,
  type StorageLike,
} from "@/lib/social/participation-session";
import type {
  ParticipationPresenceClient,
  ParticipationPresenceHandlers,
  ParticipationPresenceSubscription,
} from "@/lib/social/participation-realtime";
import { PRESENCE_SESSION_STORAGE_KEY } from "@/lib/presence/browser-session";
import type { SessionEndedContext } from "@/lib/social/session-cleanup";
import type {
  ParticipationPresencePayload,
  ParticipationSession,
  ParticipationStatus,
} from "@/lib/social/types";

const SESSION_A = "550e8400-e29b-41d4-a716-446655440000";
const SESSION_B = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & {
  store: Record<string, string>;
} {
  const store = { ...initial };
  return {
    store,
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key)
        ? store[key]!
        : null;
    },
    setItem(key: string, value: string) {
      store[key] = value;
    },
    removeItem(key: string) {
      delete store[key];
    },
  };
}

type MockPresence = ParticipationPresenceClient & {
  handlers: ParticipationPresenceHandlers | null;
  tracked: ParticipationPresencePayload[];
  untrackCount: number;
  disconnectCount: number;
  lastPresenceKey: string | null;
  emitStatus: (status: string) => void;
  emitSync: (state: Record<string, unknown[] | undefined>) => void;
};

function mockPresence(): MockPresence {
  const client: MockPresence = {
    handlers: null,
    tracked: [],
    untrackCount: 0,
    disconnectCount: 0,
    lastPresenceKey: null,
    emitStatus(status) {
      client.handlers?.onStatus(status);
    },
    emitSync(state) {
      client.handlers?.onSync(state);
    },
    connect({ presenceKey, handlers }) {
      client.lastPresenceKey = presenceKey;
      client.handlers = handlers;
      const sub: ParticipationPresenceSubscription = {
        disconnect: () => {
          client.disconnectCount += 1;
          client.handlers = null;
        },
        track: async (payload) => {
          client.tracked.push(payload);
        },
        untrack: async () => {
          client.untrackCount += 1;
        },
        getPresenceState: () => ({}),
      };
      return sub;
    },
  };
  return client;
}

describe("Social 1B/1D participation controller", () => {
  it("restores session and reconnects presence without minting a new id", () => {
    const colour = colourFromSessionId(SESSION_A);
    const storage = memoryStorage({
      [PARTICIPATION_SESSION_STORAGE_KEY]: JSON.stringify({
        sessionId: SESSION_A,
        displayName: "Alex",
        colour,
        joinedAt: "2026-08-12T12:00:00.000Z",
      }),
      [PRESENCE_SESSION_STORAGE_KEY]: "keep-me",
    });
    const presence = mockPresence();
    const selves: Array<ParticipationSession | null> = [];
    const statuses: ParticipationStatus[] = [];
    const participantLists: ParticipationPresencePayload[][] = [];

    const controller = new ParticipationController({
      storage,
      presence,
      onSelf: (s) => selves.push(s),
      onParticipants: (p) => participantLists.push(p),
      onStatus: (s) => statuses.push(s),
    });

    controller.start();
    assert.equal(selves.at(-1)?.sessionId, SESSION_A);
    assert.equal(presence.lastPresenceKey, SESSION_A);
    assert.equal(statuses.at(-1), "connecting");

    presence.emitStatus("SUBSCRIBED");
    assert.equal(statuses.at(-1), "live");
    assert.equal(presence.tracked.length, 1);
    assert.equal(presence.tracked[0]?.sessionId, SESSION_A);

    presence.emitStatus("CLOSED");
    assert.equal(statuses.at(-1), "connecting");
    presence.emitStatus("SUBSCRIBED");
    assert.equal(presence.tracked.at(-1)?.sessionId, SESSION_A);
    assert.ok(storage.getItem(PARTICIPATION_SESSION_STORAGE_KEY));
    assert.equal(storage.getItem(PRESENCE_SESSION_STORAGE_KEY), "keep-me");

    presence.emitSync({
      [SESSION_A]: [
        {
          sessionId: SESSION_A,
          name: "Alex",
          colour,
          joinedAt: "2026-08-12T12:00:00.000Z",
        },
      ],
    });
    assert.equal(participantLists.at(-1)?.length, 1);

    controller.stop();
    assert.ok(presence.disconnectCount >= 1);
    assert.ok(storage.getItem(PARTICIPATION_SESSION_STORAGE_KEY));
  });

  it("enter creates stable identity; stop does not clear sessionStorage", () => {
    const storage = memoryStorage({
      [PRESENCE_SESSION_STORAGE_KEY]: "anon-uuid",
    });
    const presence = mockPresence();
    const box: { self: ParticipationSession | null } = { self: null };

    const controller = new ParticipationController({
      storage,
      presence,
      onSelf: (s) => {
        box.self = s;
      },
      onParticipants: () => {},
      onStatus: () => {},
      randomUUID: () => SESSION_A,
      now: () => new Date("2026-08-12T12:00:00.000Z"),
    });

    controller.start();
    assert.equal(controller.getSelf(), null);
    assert.ok(presence.lastPresenceKey?.startsWith("obs-"));

    const entered = controller.enter("  Alex ");
    assert.equal(entered.ok, true);
    assert.equal(box.self && box.self.sessionId, SESSION_A);
    assert.equal(presence.lastPresenceKey, SESSION_A);

    presence.emitStatus("SUBSCRIBED");
    assert.equal(presence.tracked[0]?.name, "Alex");

    controller.stop();
    assert.ok(storage.getItem(PARTICIPATION_SESSION_STORAGE_KEY));
    assert.equal(storage.getItem(PRESENCE_SESSION_STORAGE_KEY), "anon-uuid");
  });

  it("invalid stored session starts anonymous observer", () => {
    const storage = memoryStorage({
      [PARTICIPATION_SESSION_STORAGE_KEY]: "{bad",
    });
    const presence = mockPresence();
    let status: ParticipationStatus = "connecting";
    let self: ParticipationSession | null = {
      sessionId: SESSION_A,
      displayName: "x",
      colour: colourFromSessionId(SESSION_A),
      joinedAt: "2026-08-12T12:00:00.000Z",
    };

    const controller = new ParticipationController({
      storage,
      presence,
      onSelf: (s) => {
        self = s;
      },
      onParticipants: () => {},
      onStatus: (s) => {
        status = s;
      },
      randomUUID: () => "obs-seed-0000-0000-000000000001",
    });

    controller.start();
    assert.equal(self, null);
    assert.equal(status, "anonymous");
    assert.ok(presence.lastPresenceKey?.startsWith("obs-"));
    assert.equal(presence.tracked.length, 0);
  });

  it("LEAVE clears session, untracks, keeps remotes, emits session-ended", () => {
    const colourA = colourFromSessionId(SESSION_A);
    const colourB = colourFromSessionId(SESSION_B);
    const storage = memoryStorage({
      [PARTICIPATION_SESSION_STORAGE_KEY]: JSON.stringify({
        sessionId: SESSION_A,
        displayName: "Alex",
        colour: colourA,
        joinedAt: "2026-08-12T12:00:00.000Z",
      }),
      [PRESENCE_SESSION_STORAGE_KEY]: "anon-keep",
    });
    const presence = mockPresence();
    const ended: SessionEndedContext[] = [];
    let self: ParticipationSession | null = null;
    let participants: ParticipationPresencePayload[] = [];
    let status: ParticipationStatus = "connecting";

    const controller = new ParticipationController({
      storage,
      presence,
      onSelf: (s) => {
        self = s;
      },
      onParticipants: (p) => {
        participants = p;
      },
      onStatus: (s) => {
        status = s;
      },
      onSessionEnded: (ctx) => ended.push(ctx),
    });

    controller.start();
    presence.emitStatus("SUBSCRIBED");
    presence.emitSync({
      [SESSION_A]: [
        {
          sessionId: SESSION_A,
          name: "Alex",
          colour: colourA,
          joinedAt: "2026-08-12T12:00:00.000Z",
        },
      ],
      [SESSION_B]: [
        {
          sessionId: SESSION_B,
          name: "Bob",
          colour: colourB,
          joinedAt: "2026-08-12T12:01:00.000Z",
        },
      ],
    });
    assert.equal(participants.length, 2);

    const disconnectBefore = presence.disconnectCount;
    controller.leave();

    assert.equal(self, null);
    assert.equal(status, "anonymous");
    assert.equal(storage.getItem(PARTICIPATION_SESSION_STORAGE_KEY), null);
    assert.equal(storage.getItem(PRESENCE_SESSION_STORAGE_KEY), "anon-keep");
    assert.ok(presence.untrackCount >= 1);
    assert.equal(presence.disconnectCount, disconnectBefore);
    assert.equal(participants.length, 1);
    assert.equal(participants[0]?.sessionId, SESSION_B);
    assert.equal(participants[0]?.name, "Bob");
    assert.deepEqual(ended, [{ reason: "leave", sessionId: SESSION_A }]);

    // Same-tab refresh path: stop does not clear already-left storage.
    controller.stop();
    assert.equal(storage.getItem(PARTICIPATION_SESSION_STORAGE_KEY), null);
  });

  it("same-tab restore remains when LEAVE is not used", () => {
    const colour = colourFromSessionId(SESSION_A);
    const storage = memoryStorage({
      [PARTICIPATION_SESSION_STORAGE_KEY]: JSON.stringify({
        sessionId: SESSION_A,
        displayName: "Alex",
        colour,
        joinedAt: "2026-08-12T12:00:00.000Z",
      }),
    });
    const presence = mockPresence();
    const controller = new ParticipationController({
      storage,
      presence,
      onSelf: () => {},
      onParticipants: () => {},
      onStatus: () => {},
    });
    controller.start();
    controller.stop();
    assert.ok(storage.getItem(PARTICIPATION_SESSION_STORAGE_KEY));

    const controller2 = new ParticipationController({
      storage,
      presence: mockPresence(),
      onSelf: () => {},
      onParticipants: () => {},
      onStatus: () => {},
    });
    controller2.start();
    assert.equal(controller2.getSelf()?.sessionId, SESSION_A);
  });

  it("session-ended does not fire on start/reconnect", () => {
    const colour = colourFromSessionId(SESSION_A);
    const storage = memoryStorage({
      [PARTICIPATION_SESSION_STORAGE_KEY]: JSON.stringify({
        sessionId: SESSION_A,
        displayName: "Alex",
        colour,
        joinedAt: "2026-08-12T12:00:00.000Z",
      }),
    });
    const presence = mockPresence();
    const ended: SessionEndedContext[] = [];
    const controller = new ParticipationController({
      storage,
      presence,
      onSelf: () => {},
      onParticipants: () => {},
      onStatus: () => {},
      onSessionEnded: (ctx) => ended.push(ctx),
    });
    controller.start();
    presence.emitStatus("SUBSCRIBED");
    presence.emitStatus("CLOSED");
    presence.emitStatus("SUBSCRIBED");
    controller.stop();
    assert.equal(ended.length, 0);
  });
});
