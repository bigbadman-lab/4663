/**
 * Social 1C — participant pill id + deterministic origin.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  participantPillOrigin,
  playhtmlParticipantElementId,
} from "@/lib/social/participant-pill";

const SESSION_A = "550e8400-e29b-41d4-a716-446655440000";
const SESSION_B = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const SESSION_C = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("Social 1C participant pill helpers", () => {
  it("stable DOM id uses sessionId, not display name", () => {
    assert.equal(
      playhtmlParticipantElementId(SESSION_A),
      `4663-participant-${SESSION_A}`,
    );
    assert.equal(
      playhtmlParticipantElementId(SESSION_A).includes("Alex"),
      false,
    );
  });

  it("same-tab restored session uses same PlayHTML id", () => {
    const first = playhtmlParticipantElementId(SESSION_A);
    const restored = playhtmlParticipantElementId(SESSION_A);
    assert.equal(first, restored);
  });

  it("deterministic initial position is stable for same sessionId", () => {
    assert.deepEqual(
      participantPillOrigin(SESSION_A),
      participantPillOrigin(SESSION_A),
    );
  });

  it("different session ids distribute across different positions", () => {
    const a = participantPillOrigin(SESSION_A);
    const b = participantPillOrigin(SESSION_B);
    const c = participantPillOrigin(SESSION_C);
    const keys = new Set([
      `${a.leftPct},${a.topPct}`,
      `${b.leftPct},${b.topPct}`,
      `${c.leftPct},${c.topPct}`,
    ]);
    assert.ok(keys.size >= 2);

    for (const origin of [a, b, c]) {
      assert.ok(origin.leftPct >= 12 && origin.leftPct <= 88);
      assert.ok(origin.topPct >= 22 && origin.topPct <= 70);
    }
  });
});
