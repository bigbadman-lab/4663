/**
 * Social 5 — RESET + SUMMON session semantics (structural / controller).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
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
import type { ParticipationPresencePayload } from "@/lib/social/types";
import {
  registerSessionContentResetHandler,
  sessionContentResetRegistry,
} from "@/lib/social/session-content-reset";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const SESSION_A = "550e8400-e29b-41d4-a716-446655440000";

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

function mockPresence(): ParticipationPresenceClient & {
  tracked: ParticipationPresencePayload[];
  handlers: ParticipationPresenceHandlers | null;
  emitStatus: (status: string) => void;
} {
  const client = {
    tracked: [] as ParticipationPresencePayload[],
    handlers: null as ParticipationPresenceHandlers | null,
    emitStatus(status: string) {
      client.handlers?.onStatus(status);
    },
    connect({ handlers }: { presenceKey: string; handlers: ParticipationPresenceHandlers }) {
      client.handlers = handlers;
      const sub: ParticipationPresenceSubscription = {
        disconnect: () => {
          client.handlers = null;
        },
        track: async (payload) => {
          client.tracked.push(payload);
        },
        untrack: async () => {},
        getPresenceState: () => ({}),
      };
      return sub;
    },
  };
  return client;
}

describe("Social 5 RESET semantics", () => {
  it("RESET clears WATCH and notifies content reset without ending identity", () => {
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
    const resets: string[] = [];
    const ended: string[] = [];
    const controller = new ParticipationController({
      storage,
      presence,
      onSelf: () => {},
      onParticipants: () => {},
      onStatus: () => {},
      onSessionEnded: (ctx) => ended.push(ctx.sessionId),
      onSessionContentReset: (ctx) => resets.push(ctx.sessionId),
    });
    controller.start();
    presence.emitStatus("SUBSCRIBED");
    const eventId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    assert.equal(controller.watch(eventId).ok, true);
    assert.deepEqual(controller.getWatchedEventIds(), [eventId]);

    const result = controller.resetContent();
    assert.equal(result.ok, true);
    assert.deepEqual(controller.getWatchedEventIds(), []);
    assert.equal(controller.getSelf()?.sessionId, SESSION_A);
    assert.ok(storage.getItem(PARTICIPATION_SESSION_STORAGE_KEY));
    assert.deepEqual(resets, [SESSION_A]);
    assert.deepEqual(ended, []);
    assert.deepEqual(presence.tracked.at(-1)?.watchedEventIds, []);
  });

  it("ephemeral layer registers RESET content cleanup", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("registerSessionContentResetHandler"));
    assert.ok(layer.includes("removeEphemeralTextsByOwner"));
    assert.ok(layer.includes("removeEphemeralDrawingsByOwner"));
  });

  it("session content reset registry exists distinct from leave", () => {
    let hits = 0;
    const unsub = registerSessionContentResetHandler(() => {
      hits += 1;
    });
    sessionContentResetRegistry.notify({
      reason: "reset",
      sessionId: SESSION_A,
    });
    assert.equal(hits, 1);
    unsub();
  });
});
