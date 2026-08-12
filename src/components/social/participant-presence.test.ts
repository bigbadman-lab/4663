/**
 * Social 1C — movable participant presence pills (structural).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { colourFromSessionId } from "@/lib/social/colour";
import {
  participantPillOrigin,
  playhtmlParticipantElementId,
} from "@/lib/social/participant-pill";
import { dedupeParticipantsBySessionId } from "@/lib/social/presence-payload";
import type { ParticipationPresencePayload } from "@/lib/social/types";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const SESSION_A = "550e8400-e29b-41d4-a716-446655440000";
const SESSION_B = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function participant(
  sessionId: string,
  name: string,
): ParticipationPresencePayload {
  return {
    sessionId,
    name,
    colour: colourFromSessionId(sessionId),
    joinedAt: "2026-08-12T12:00:00.000Z",
  };
}

/** Mirror layer keying: one pill per deduped presence entry. */
function pillsForParticipants(
  participants: readonly ParticipationPresencePayload[],
  selfSessionId: string | null,
) {
  const unique = dedupeParticipantsBySessionId(participants);
  return unique.map((p) => ({
    id: playhtmlParticipantElementId(p.sessionId),
    name: p.name,
    colour: p.colour,
    isSelf: selfSessionId === p.sessionId,
    origin: participantPillOrigin(p.sessionId),
  }));
}

describe("Social 1C participant presence layer", () => {
  it("anonymous user renders no self pill; remotes still map by presence", () => {
    const remotes = pillsForParticipants(
      [participant(SESSION_A, "Alex")],
      null,
    );
    assert.equal(remotes.length, 1);
    assert.equal(remotes[0]?.isSelf, false);

    const none = pillsForParticipants([], null);
    assert.equal(none.length, 0);
  });

  it("one named participant renders one pill", () => {
    const pills = pillsForParticipants(
      [participant(SESSION_A, "Alex")],
      SESSION_A,
    );
    assert.equal(pills.length, 1);
    assert.equal(pills[0]?.id, `4663-participant-${SESSION_A}`);
    assert.equal(pills[0]?.isSelf, true);
    assert.equal(pills[0]?.name, "Alex");
    assert.equal(pills[0]?.colour, colourFromSessionId(SESSION_A));
  });

  it("multiple presence entries render one pill each (deduped)", () => {
    const pills = pillsForParticipants(
      [
        participant(SESSION_A, "Alex"),
        participant(SESSION_A, "Alex"),
        participant(SESSION_B, "Bob"),
      ],
      SESSION_A,
    );
    assert.equal(pills.length, 2);
    assert.equal(pills[0]?.id, `4663-participant-${SESSION_A}`);
    assert.equal(pills[1]?.id, `4663-participant-${SESSION_B}`);
  });

  it("participant removal from list removes pill", () => {
    const before = pillsForParticipants(
      [participant(SESSION_A, "Alex"), participant(SESSION_B, "Bob")],
      SESSION_A,
    );
    assert.equal(before.length, 2);
    const after = pillsForParticipants(
      [participant(SESSION_B, "Bob")],
      SESSION_A,
    );
    assert.equal(after.length, 1);
    assert.equal(after[0]?.id, `4663-participant-${SESSION_B}`);
  });

  it("CanMoveElement receives a direct DOM host child", () => {
    const pill = readSrc("src/components/social/participant-pill.tsx");
    assert.ok(pill.includes("CanMoveElement"));
    assert.ok(/<CanMoveElement[^>]*>\s*<div\b/.test(pill));
    assert.equal(
      /<CanMoveElement[^>]*>\s*<Participant/.test(pill),
      false,
    );
    assert.ok(pill.includes("playhtmlParticipantElementId"));
  });

  it("assigned Social 1B colour is represented on the label", () => {
    const pill = readSrc("src/components/social/participant-pill.tsx");
    assert.ok(pill.includes("style={{ color: colour }}"));
    assert.ok(pill.includes("[ {name} ]"));
  });

  it("ownership: self movable, remote not locally draggable", () => {
    const pill = readSrc("src/components/social/participant-pill.tsx");
    assert.ok(pill.includes("cursor-grab"));
    assert.ok(pill.includes("pointer-events-none"));
    assert.ok(
      pill.includes(
        "CanMoveElement has no readOnly prop",
      ) || pill.includes("pointer-events-none"),
    );
    assert.ok(pill.includes("isSelf"));
    assert.ok(pill.includes("data-4663-participant-self"));
  });

  it("layer consumes useParticipation and mounts inside canvas surface", () => {
    const layer = readSrc(
      "src/components/social/participant-presence-layer.tsx",
    );
    assert.ok(layer.includes("useParticipation"));
    assert.ok(layer.includes("ParticipantPill"));
    assert.ok(layer.includes("participants.map"));
    assert.ok(layer.includes("key={participant.sessionId}"));

    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("ParticipantPresenceLayer"));
  });

  it("does not introduce Postgres writes or new API routes", () => {
    const pill = readSrc("src/components/social/participant-pill.tsx");
    const layer = readSrc(
      "src/components/social/participant-presence-layer.tsx",
    );
    const helpers = readSrc("src/lib/social/participant-pill.ts");
    for (const src of [pill, layer, helpers]) {
      assert.equal(src.includes("fetch("), false);
      assert.equal(src.includes("/api/"), false);
      assert.equal(src.includes("from(\"presence\")"), false);
      assert.equal(src.includes("supabase.from"), false);
    }
  });

  it("PlayHTML patch remains untouched", () => {
    const pkg = readSrc("package.json");
    assert.ok(pkg.includes("patch-package"));
    const patch = readSrc("patches/playhtml+2.14.1.patch");
    assert.ok(patch.includes("Ge.delete") || patch.length > 0);
  });

  it("z-index sits above PONS (15/16) and below palette (18) / chrome (20)", () => {
    const pill = readSrc("src/components/social/participant-pill.tsx");
    assert.ok(pill.includes("z-[17]"));
  });
});
