/**
 * Social 4 — session-bound WATCH helpers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addWatchedEventId,
  isWatchingEvent,
  MAX_WATCHED_EVENTS_PER_SESSION,
  normalizeWatchedEventIds,
  pruneWatchedEventIds,
  removeWatchedEventId,
  toggleWatchedEventId,
  watchCountForEvent,
} from "@/lib/social/watch";
import type { ParticipationPresencePayload } from "@/lib/social/types";

const EVENT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const EVENT_B = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const EVENT_C = "cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const SESSION_A = "550e8400-e29b-41d4-a716-446655440000";
const SESSION_B = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function participant(
  sessionId: string,
  watchedEventIds: string[],
): ParticipationPresencePayload {
  return {
    sessionId,
    name: "Alex",
    colour: "#8FAE00",
    joinedAt: "2026-08-13T00:00:00.000Z",
    watchedEventIds,
  };
}

describe("Social 4 WATCH helpers", () => {
  it("defaults empty and validates UUIDs", () => {
    assert.deepEqual(normalizeWatchedEventIds(undefined), []);
    assert.deepEqual(normalizeWatchedEventIds(null), []);
    assert.deepEqual(normalizeWatchedEventIds("nope"), []);
    assert.deepEqual(normalizeWatchedEventIds([EVENT_A, "bad", EVENT_A]), [
      EVENT_A,
    ]);
  });

  it("enforces MAX_WATCHED_EVENTS_PER_SESSION", () => {
    assert.equal(MAX_WATCHED_EVENTS_PER_SESSION, 8);
    const many = Array.from({ length: 12 }, (_, i) => {
      const n = (i + 1).toString(16).padStart(12, "0");
      return `00000000-0000-4000-8000-${n}`;
    });
    const normalized = normalizeWatchedEventIds(many);
    assert.equal(normalized.length, MAX_WATCHED_EVENTS_PER_SESSION);
  });

  it("add/remove/toggle and count distinct sessions", () => {
    assert.equal(isWatchingEvent([], EVENT_A), false);
    const one = addWatchedEventId([], EVENT_A);
    assert.deepEqual(one, [EVENT_A]);
    assert.deepEqual(addWatchedEventId(one, EVENT_A), [EVENT_A]);
    assert.deepEqual(removeWatchedEventId(one, EVENT_A), []);
    assert.deepEqual(toggleWatchedEventId([], EVENT_A), {
      next: [EVENT_A],
      watching: true,
    });
    assert.deepEqual(toggleWatchedEventId([EVENT_A], EVENT_A), {
      next: [],
      watching: false,
    });

    const participants = [
      participant(SESSION_A, [EVENT_A, EVENT_B]),
      participant(SESSION_A, [EVENT_A]), // dup session ignored
      participant(SESSION_B, [EVENT_A]),
    ];
    assert.equal(watchCountForEvent(participants, EVENT_A), 2);
    assert.equal(watchCountForEvent(participants, EVENT_B), 1);
    assert.equal(watchCountForEvent(participants, EVENT_C), 0);
  });

  it("prunes stale live event ids", () => {
    assert.deepEqual(
      pruneWatchedEventIds([EVENT_A, EVENT_B, EVENT_C], [EVENT_B]),
      [EVENT_B],
    );
  });
});
