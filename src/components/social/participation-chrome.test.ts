/**
 * Social 1B — chrome enter affordance structural checks.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PARTICIPATION_SESSION_STORAGE_KEY } from "@/lib/social/participation-session";
import { PARTICIPATION_CHANNEL_NAME } from "@/lib/social/participation-realtime";
import { PRESENCE_SESSION_STORAGE_KEY } from "@/lib/presence/browser-session";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Social 1B chrome + boundaries", () => {
  it("enter affordance lives in canvas chrome top-left", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("ParticipationEnterTrigger"));
    assert.ok(chrome.includes("ParticipationEnterForm"));
    assert.ok(chrome.includes("data-4663-chrome-participation"));
    assert.ok(chrome.includes("top-5 left-5") || chrome.includes("sm:top-6 sm:left-6"));
    assert.ok(chrome.includes("useParticipation"));
    assert.equal(chrome.includes("CanMoveElement"), false);
  });

  it("ParticipationProvider wraps canvas root once", () => {
    const rootSrc = readSrc("src/components/canvas/canvas-root.tsx");
    assert.ok(rootSrc.includes("<ParticipationProvider>"));
    assert.ok(rootSrc.includes("</ParticipationProvider>"));
    assert.equal(
      (rootSrc.match(/<ParticipationProvider>/g) ?? []).length,
      1,
    );
  });

  it("uses sessionStorage key distinct from anonymous presence", () => {
    assert.equal(
      PARTICIPATION_SESSION_STORAGE_KEY,
      "4663_participation_session",
    );
    assert.notEqual(
      PARTICIPATION_SESSION_STORAGE_KEY,
      PRESENCE_SESSION_STORAGE_KEY,
    );
    const sessionSrc = readSrc("src/lib/social/participation-session.ts");
    assert.equal(sessionSrc.includes("window.localStorage"), false);
    assert.equal(sessionSrc.includes("PRESENCE_SESSION_STORAGE_KEY"), false);
    const hookSrc = readSrc("src/lib/social/use-participation.tsx");
    assert.ok(hookSrc.includes("sessionStorage"));
    assert.equal(hookSrc.includes("localStorage"), false);
  });

  it("realtime channel is 4663-participation", () => {
    assert.equal(PARTICIPATION_CHANNEL_NAME, "4663-participation");
  });

  it("does not modify anonymous presence heartbeat modules", () => {
    const heartbeat = readSrc("src/components/presence-heartbeat.tsx");
    assert.ok(heartbeat.includes("getOrCreatePresenceSessionId"));
    assert.equal(heartbeat.includes("participation"), false);

    const browserSession = readSrc("src/lib/presence/browser-session.ts");
    assert.equal(
      browserSession.includes("PARTICIPATION_SESSION_STORAGE_KEY"),
      false,
    );
  });

  it("does not touch PlayHTML patch or summon lifetime", () => {
    const summon = readSrc("src/lib/canvas/summon.ts");
    assert.ok(summon.includes("SUMMON_LIFETIME_MS"));
    const pkg = readSrc("package.json");
    assert.ok(pkg.includes("patch-package"));
  });
});
