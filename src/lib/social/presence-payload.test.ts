/**
 * Social 1B — presence payload + participant dedupe.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { colourFromSessionId } from "@/lib/social/colour";
import {
  dedupeParticipantsBySessionId,
  normalizePresencePayload,
  participantsFromPresenceState,
  presencePayloadFromSession,
  presencePayloadPublicKeys,
} from "@/lib/social/presence-payload";
import type { ParticipationSession } from "@/lib/social/types";

const SESSION_A = "550e8400-e29b-41d4-a716-446655440000";
const SESSION_B = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

describe("Social 1B presence payload", () => {
  it("contains only intended public fields", () => {
    const session: ParticipationSession = {
      sessionId: SESSION_A,
      displayName: "Alex",
      colour: colourFromSessionId(SESSION_A),
      joinedAt: "2026-08-12T12:00:00.000Z",
    };
    const payload = presencePayloadFromSession(session);
    assert.deepEqual(presencePayloadPublicKeys(payload), [
      "colour",
      "joinedAt",
      "name",
      "sessionId",
    ]);
    assert.equal(payload.name, "Alex");
    assert.equal(payload.sessionId, SESSION_A);
    assert.equal(
      Object.prototype.hasOwnProperty.call(payload, "location"),
      false,
    );
  });

  it("normalizes valid metas and rejects invalid", () => {
    const colour = colourFromSessionId(SESSION_A);
    assert.deepEqual(
      normalizePresencePayload({
        sessionId: SESSION_A,
        name: "Alex",
        colour,
        joinedAt: "2026-08-12T12:00:00.000Z",
        presence_ref: "abc",
      }),
      {
        sessionId: SESSION_A,
        name: "Alex",
        colour,
        joinedAt: "2026-08-12T12:00:00.000Z",
      },
    );
    assert.equal(
      normalizePresencePayload({
        sessionId: SESSION_A,
        name: "",
        colour,
        joinedAt: "2026-08-12T12:00:00.000Z",
      }),
      null,
    );
  });

  it("deduplicates participants by session id", () => {
    const colourA = colourFromSessionId(SESSION_A);
    const colourB = colourFromSessionId(SESSION_B);
    const list = dedupeParticipantsBySessionId([
      {
        sessionId: SESSION_A,
        name: "Alex",
        colour: colourA,
        joinedAt: "2026-08-12T12:00:00.000Z",
      },
      {
        sessionId: SESSION_A,
        name: "Alex Dup",
        colour: colourA,
        joinedAt: "2026-08-12T12:01:00.000Z",
      },
      {
        sessionId: SESSION_B,
        name: "Sam",
        colour: colourB,
        joinedAt: "2026-08-12T12:02:00.000Z",
      },
    ]);
    assert.equal(list.length, 2);
    assert.equal(list[0]?.name, "Alex");
    assert.equal(list[1]?.name, "Sam");
  });

  it("flattens presence state with dedupe", () => {
    const colourA = colourFromSessionId(SESSION_A);
    const participants = participantsFromPresenceState({
      [SESSION_A]: [
        {
          presence_ref: "1",
          sessionId: SESSION_A,
          name: "Alex",
          colour: colourA,
          joinedAt: "2026-08-12T12:00:00.000Z",
        },
        {
          presence_ref: "2",
          sessionId: SESSION_A,
          name: "Alex",
          colour: colourA,
          joinedAt: "2026-08-12T12:00:00.000Z",
        },
      ],
    });
    assert.equal(participants.length, 1);
    assert.equal(participants[0]?.sessionId, SESSION_A);
  });
});
