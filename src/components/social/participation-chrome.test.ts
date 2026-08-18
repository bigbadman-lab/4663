/**
 * Social 1B / 1C.1 — participation control placement + boundaries.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  HERO_SUBTITLE_DEFAULT_STYLE,
  HERO_TITLE_DEFAULT_STYLE,
  PARTICIPATION_CONTROL_DEFAULT_STYLE,
} from "@/lib/canvas/hero";
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

describe("Social 1B / 1C.1 participation control placement", () => {
  it("CanvasChrome no longer places participation in top-left", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.equal(chrome.includes("top-5 left-5"), false);
    assert.equal(chrome.includes("sm:top-6 sm:left-6"), false);
    assert.equal(
      /data-4663-chrome-participation[\s\S]*?top-5 left-5/.test(chrome),
      false,
    );
  });

  it("hero-area UI renders ENTER; named session + X are top-right", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("ParticipationEnterTrigger"));
    assert.ok(chrome.includes("ParticipationSessionControl"));
    assert.ok(chrome.includes("ParticipationEnterForm"));
    assert.ok(chrome.includes("data-4663-chrome-participation"));
    assert.ok(chrome.includes("data-4663-chrome-identity"));
    assert.ok(chrome.includes("PARTICIPATION_CONTROL_DEFAULT_STYLE"));
    assert.ok(chrome.includes("useParticipation"));
    assert.equal(chrome.includes("CanMoveElement"), false);

    const participation = chrome.slice(
      chrome.indexOf("data-4663-chrome-participation"),
      chrome.indexOf("data-4663-chrome-top-right"),
    );
    assert.ok(participation.includes("ParticipationEnterTrigger"));
    assert.equal(participation.includes("ParticipationSessionControl"), false);

    const topRight = chrome.slice(
      chrome.indexOf("data-4663-chrome-top-right"),
      chrome.indexOf("data-4663-chrome-presence"),
    );
    assert.ok(topRight.includes("ParticipationSessionControl"));
    assert.ok(topRight.includes("CanvasXLink"));
    assert.equal(topRight.includes("sm:top-6"), false);
    assert.equal(topRight.includes("sm:right-6"), false);

    assert.equal(PARTICIPATION_CONTROL_DEFAULT_STYLE.left, "50%");
    assert.equal(
      PARTICIPATION_CONTROL_DEFAULT_STYLE.top,
      "calc(52% + 2.75rem)",
    );
    assert.equal(HERO_TITLE_DEFAULT_STYLE.top, "42%");
    assert.equal(HERO_SUBTITLE_DEFAULT_STYLE.top, "52%");
  });

  it("anonymous state exposes [ ENTER ]; named uses session control", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("isParticipating"));
    assert.ok(chrome.includes("ParticipationEnterTrigger"));
    assert.ok(chrome.includes("ParticipationSessionControl"));
    assert.ok(chrome.includes("onLeave={leave}"));
    assert.equal(chrome.includes("ParticipationSelfBadge"), false);

    const trigger = readSrc(
      "src/components/social/participation-enter-trigger.tsx",
    );
    assert.ok(trigger.includes("[ ENTER ]"));

    const session = readSrc(
      "src/components/social/participation-session-control.tsx",
    );
    assert.ok(session.includes("[ LEAVE ]"));
    assert.ok(session.includes("data-4663-participation-leave"));
    assert.ok(session.includes("data-4663-participation-self"));
  });

  it("participation control is NOT nested inside brand hero", () => {
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.equal(brand.includes("ParticipationEnter"), false);
    assert.equal(brand.includes("ParticipationSelf"), false);
    assert.equal(brand.includes("useParticipation"), false);
    assert.equal(brand.includes("PARTICIPATION_CONTROL"), false);
    assert.equal((brand.match(/<CanMoveElement\b/g) ?? []).length, 0);

    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("data-4663-chrome-participation"));
    assert.ok(chrome.includes("BrandAnchors"));
  });

  it("ParticipantPresenceLayer remains unchanged wiring", () => {
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("ParticipantPresenceLayer"));
    assert.equal(surface.includes("MovableHero"), false);

    const layer = readSrc(
      "src/components/social/participant-presence-layer.tsx",
    );
    assert.ok(layer.includes("useParticipation"));
    assert.ok(layer.includes("ParticipantPill"));
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
