/**
 * Social 2A.1 — empty-canvas pointer routing (structural).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Social 2A.1 empty-canvas pointer routing", () => {
  it("ParticipantPresenceLayer wrapper is pointer-events-none", () => {
    const layer = readSrc(
      "src/components/social/participant-presence-layer.tsx",
    );
    assert.ok(layer.includes("pointer-events-none absolute inset-0"));
    assert.ok(layer.includes("data-4663-participant-layer"));
  });

  it("own pill is pointer-events-auto; remote stays none", () => {
    const pill = readSrc("src/components/social/participant-pill.tsx");
    assert.ok(pill.includes("pointer-events-auto absolute z-[17]"));
    assert.ok(pill.includes("pointer-events-none absolute z-[17]"));
    assert.ok(pill.includes("isSelf"));
  });

  it("MovableLiveEventLayer wrapper is pointer-events-none", () => {
    const layer = readSrc(
      "src/components/canvas/movable-live-event-layer.tsx",
    );
    assert.ok(layer.includes("pointer-events-none absolute inset-0"));
    assert.ok(layer.includes("data-4663-live-event-layer"));
  });

  it("live movable PONS host is pointer-events-auto", () => {
    const object = readSrc(
      "src/components/canvas/pons-buying-activity-object.tsx",
    );
    assert.ok(
      object.includes(
        "pointer-events-auto absolute z-[15] cursor-grab",
      ),
    );
  });

  it("SummonLayer wrapper is pointer-events-none", () => {
    const layer = readSrc("src/components/canvas/summon-layer.tsx");
    assert.ok(layer.includes("pointer-events-none absolute inset-0"));
    assert.ok(layer.includes("data-4663-summon-layer"));
  });

  it("summoned movable host is pointer-events-auto", () => {
    const summoned = readSrc(
      "src/components/canvas/summoned-pons-object.tsx",
    );
    assert.ok(
      summoned.includes(
        "pointer-events-auto absolute z-[16] cursor-grab",
      ),
    );
  });

  it("empty hit / menu / composer / owner text remain interactive", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("pointer-events-none absolute inset-0"));
    assert.ok(
      layer.includes("pointer-events-auto absolute inset-0 z-0"),
    );
    assert.ok(layer.includes("data-4663-canvas-empty-hit"));
    assert.ok(layer.includes('className="pointer-events-auto"'));

    const object = readSrc(
      "src/components/social/ephemeral-text-object.tsx",
    );
    assert.ok(object.includes("pointer-events-auto absolute z-[16]"));
    assert.ok(object.includes("pointer-events-none absolute z-[16]"));
  });

  it("z-index values remain unchanged", () => {
    const pill = readSrc("src/components/social/participant-pill.tsx");
    assert.ok(pill.includes("z-[17]"));
    const live = readSrc(
      "src/components/canvas/pons-buying-activity-object.tsx",
    );
    assert.ok(live.includes("z-[15]"));
    const summoned = readSrc(
      "src/components/canvas/summoned-pons-object.tsx",
    );
    assert.ok(summoned.includes("z-[16]"));
    const text = readSrc("src/components/social/ephemeral-text-object.tsx");
    assert.ok(text.includes("z-[16]"));
    const menu = readSrc("src/components/social/canvas-create-menu.tsx");
    assert.ok(menu.includes("z-[19]"));
  });
});
