/**
 * Social 1B — colour assignment + participation session identity.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  colourFromSessionId,
  PARTICIPATION_COLOUR_PALETTE,
} from "@/lib/social/colour";
import {
  clearParticipationSession,
  createParticipationSession,
  enterParticipationSession,
  leaveParticipationSession,
  PARTICIPATION_SESSION_STORAGE_KEY,
  readParticipationSession,
  writeParticipationSession,
  type StorageLike,
} from "@/lib/social/participation-session";
import { PRESENCE_SESSION_STORAGE_KEY } from "@/lib/presence/browser-session";

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

describe("Social 1B colour assignment", () => {
  it("assigns colour deterministically from session id", () => {
    const a1 = colourFromSessionId(SESSION_A);
    const a2 = colourFromSessionId(SESSION_A);
    const b = colourFromSessionId(SESSION_B);
    assert.equal(a1, a2);
    assert.ok(PARTICIPATION_COLOUR_PALETTE.includes(a1));
    assert.ok(PARTICIPATION_COLOUR_PALETTE.includes(b));
  });
});

describe("Social 1B participation session", () => {
  it("creates a participation session with uuid, name, colour, joinedAt", () => {
    const result = createParticipationSession({
      displayName: "  Alex ",
      randomUUID: () => SESSION_A,
      now: () => new Date("2026-08-12T12:00:00.000Z"),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.session.sessionId, SESSION_A);
    assert.equal(result.session.displayName, "Alex");
    assert.equal(
      result.session.colour,
      colourFromSessionId(SESSION_A),
    );
    assert.equal(result.session.joinedAt, "2026-08-12T12:00:00.000Z");
  });

  it("restores the same identity from sessionStorage (same-tab)", () => {
    const storage = memoryStorage();
    const entered = enterParticipationSession(storage, {
      displayName: "Alex",
      randomUUID: () => SESSION_A,
      now: () => new Date("2026-08-12T12:00:00.000Z"),
    });
    assert.equal(entered.ok, true);
    if (!entered.ok) return;

    const restored = readParticipationSession(storage);
    assert.deepEqual(restored, entered.session);
    assert.ok(storage.store[PARTICIPATION_SESSION_STORAGE_KEY]);
  });

  it("falls back to anonymous when stored session is invalid", () => {
    const storage = memoryStorage({
      [PARTICIPATION_SESSION_STORAGE_KEY]: JSON.stringify({
        sessionId: "not-a-uuid",
        displayName: "Alex",
        colour: "#8FAE00",
        joinedAt: "2026-08-12T12:00:00.000Z",
      }),
    });
    assert.equal(readParticipationSession(storage), null);
    assert.equal(storage.getItem(PARTICIPATION_SESSION_STORAGE_KEY), null);
  });

  it("rejects mismatched colour on restore", () => {
    const storage = memoryStorage({
      [PARTICIPATION_SESSION_STORAGE_KEY]: JSON.stringify({
        sessionId: SESSION_A,
        displayName: "Alex",
        colour: "#000000",
        joinedAt: "2026-08-12T12:00:00.000Z",
      }),
    });
    assert.equal(readParticipationSession(storage), null);
  });

  it("leave clears participation session state", () => {
    const storage = memoryStorage();
    const entered = enterParticipationSession(storage, {
      displayName: "Alex",
      randomUUID: () => SESSION_A,
      now: () => new Date("2026-08-12T12:00:00.000Z"),
    });
    assert.equal(entered.ok, true);
    leaveParticipationSession(storage);
    assert.equal(readParticipationSession(storage), null);
    assert.equal(storage.getItem(PARTICIPATION_SESSION_STORAGE_KEY), null);
  });

  it("does not touch anonymous presence localStorage key", () => {
    const storage = memoryStorage({
      [PRESENCE_SESSION_STORAGE_KEY]: SESSION_B,
    });
    enterParticipationSession(storage, {
      displayName: "Alex",
      randomUUID: () => SESSION_A,
      now: () => new Date("2026-08-12T12:00:00.000Z"),
    });
    leaveParticipationSession(storage);
    clearParticipationSession(storage);
    assert.equal(storage.getItem(PRESENCE_SESSION_STORAGE_KEY), SESSION_B);
    assert.notEqual(
      PARTICIPATION_SESSION_STORAGE_KEY,
      PRESENCE_SESSION_STORAGE_KEY,
    );
  });

  it("write + read round-trip preserves session", () => {
    const storage = memoryStorage();
    const session = {
      sessionId: SESSION_A,
      displayName: "Alex",
      colour: colourFromSessionId(SESSION_A),
      joinedAt: "2026-08-12T12:00:00.000Z",
    };
    writeParticipationSession(storage, session);
    assert.deepEqual(readParticipationSession(storage), session);
  });
});
