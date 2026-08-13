/**
 * Social 1D — named session control + LEAVE wiring (structural).
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

describe("Social 1D session control", () => {
  it("named control exposes LEAVE via session control", () => {
    const control = readSrc(
      "src/components/social/participation-session-control.tsx",
    );
    assert.ok(control.includes("[ LEAVE ]"));
    assert.ok(control.includes("onLeave"));
    assert.ok(control.includes("data-4663-participation-leave"));
    assert.ok(control.includes("Escape"));
  });

  it("LEAVE uses canonical participation leave primitive", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("leave"));
    assert.ok(chrome.includes("ParticipationSessionControl"));
    assert.ok(chrome.includes("onLeave={leave}"));

    const hook = readSrc("src/lib/social/use-participation.tsx");
    assert.ok(hook.includes("controllerRef.current?.leave()"));

    const controller = readSrc("src/lib/social/participation-controller.ts");
    assert.ok(controller.includes("clearParticipationSession"));
    assert.ok(controller.includes("onSessionEnded"));
    assert.ok(controller.includes('reason: "leave"'));
  });

  it("RESET palette remains placeholder / unchanged", () => {
    const defs = readSrc("src/lib/canvas/control-palette.ts");
    assert.ok(defs.includes('"reset"'));
    const palette = readSrc("src/components/canvas/canvas-control-palette.tsx");
    assert.ok(palette.includes("onReset"));
    assert.equal(palette.includes("leave("), false);
    assert.equal(palette.includes("ParticipationController"), false);
  });

  it("cleanup registry exists for future session-owned features", () => {
    const cleanup = readSrc("src/lib/social/session-cleanup.ts");
    assert.ok(cleanup.includes("registerSessionEndedHandler"));
    assert.ok(cleanup.includes("notifySessionEnded"));
    assert.ok(cleanup.includes("SessionCleanupRegistry"));
  });

  it("SUMMON and PlayHTML patch remain untouched by 1D session control", () => {
    const summon = readSrc("src/lib/canvas/summon.ts");
    assert.ok(summon.includes("SUMMON_LIFETIME_MS"));
    const pkg = readSrc("package.json");
    assert.ok(pkg.includes("patch-package"));
    const control = readSrc(
      "src/components/social/participation-session-control.tsx",
    );
    assert.equal(control.includes("CanMoveElement"), false);
    assert.equal(control.includes("summon"), false);
  });
});
