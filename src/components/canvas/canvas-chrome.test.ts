/**
 * Stage 10B.7 — canvas chrome footer + intro note structural tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { formatLocalClock } from "@/lib/canvas/format-local-clock";
import {
  PLAYHTML_HERO_SUBTITLE_ID,
  PLAYHTML_HERO_TITLE_ID,
  PLAYHTML_LOGO_ID,
} from "@/lib/canvas/hero";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Stage 10B.7 canvas chrome footer + intro", () => {
  it("presence is mounted bottom-left in chrome", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("PresenceStatus"));
    assert.ok(chrome.includes("data-4663-chrome-presence"));
    assert.ok(chrome.includes("bottom-5 left-5") || chrome.includes("bottom-6 left-6"));
    assert.ok(chrome.includes("sm:bottom-6 sm:left-6"));
    assert.equal(chrome.includes("justify-end"), false);

    const presence = readSrc("src/components/presence-status.tsx");
    assert.ok(
      presence.includes("PresenceBubbleMap") ||
        presence.includes("presence-bubble-map"),
    );
    const map = readSrc("src/components/presence-bubble-map.tsx");
    assert.ok(map.includes("PEOPLE HERE") || map.includes("formatPeopleHereLabel"));
    assert.ok(map.includes("startPresenceSummaryPolling"));
    assert.ok(map.includes("byCountry"));
    assert.equal(map.includes("session_id"), false);
    assert.equal(map.includes("formatPresenceLine"), false);
    assert.ok(map.includes("data-4663-presence-status"));
    assert.ok(chrome.includes("max-w-[min(16rem"));
  });

  it("clock exists bottom-right with client-only 1s updates", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("CanvasLiveClock"));
    assert.ok(chrome.includes("data-4663-chrome-clock"));
    assert.ok(chrome.includes("bottom-5 right-5") || chrome.includes("sm:bottom-6 sm:right-6"));
    assert.ok(chrome.includes("pointer-events-auto"));

    const clock = readSrc("src/components/canvas/canvas-live-clock.tsx");
    assert.ok(clock.includes("setInterval"));
    assert.ok(clock.includes("1000"));
    assert.ok(clock.includes('aria-live="off"'));
    assert.ok(clock.includes("formatLocalClock"));
    assert.equal(clock.includes("fetch("), false);
    assert.ok(clock.includes("https://x.com/4663live"));
    assert.ok(clock.includes('data-4663-x-link'));
    assert.ok(clock.includes('aria-label="4663 on X"'));
    assert.ok(clock.includes('target="_blank"'));
    assert.ok(clock.includes("noopener noreferrer"));
  });

  it("formatLocalClock is deterministic", () => {
    const d = new Date(2026, 7, 12, 13, 8, 42);
    assert.equal(formatLocalClock(d), "12 AUG 2026 · 13:08:42");
    const single = new Date(2026, 0, 5, 9, 5, 7);
    assert.equal(formatLocalClock(single), "5 JAN 2026 · 09:05:07");
  });

  it("intro trigger is top-right and opens note", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("CanvasIntroTrigger"));
    assert.ok(chrome.includes("top-5 right-5") || chrome.includes("sm:top-6 sm:right-6"));
    assert.ok(chrome.includes("infoModal"));
    assert.ok(chrome.includes("CanvasIntroNote"));
    assert.ok(chrome.includes("CanvasToneControl"));
    assert.ok(chrome.includes("data-4663-chrome-top-right"));

    const trigger = readSrc("src/components/canvas/canvas-intro-trigger.tsx");
    assert.ok(trigger.includes("[ WHAT IS THIS? ]"));
    assert.ok(trigger.includes("onOpen"));
    assert.ok(trigger.includes('type="button"'));
  });

  it("intro note has core copy, dialog semantics, and close paths", () => {
    const note = readSrc("src/components/canvas/canvas-intro-note.tsx");
    assert.ok(note.includes('role="dialog"'));
    assert.ok(note.includes('aria-modal="true"'));
    assert.ok(note.includes("canvas for the internet with web3 capabilities"));
    assert.ok(note.includes("No accounts. No sign-ups."));
    assert.ok(note.includes("connected to Robinhood Chain"));
    assert.ok(note.includes("Part canvas. Part network. Part machine."));
    assert.ok(note.includes("Welcome to 4663."));
    assert.ok(note.includes('aria-label="Close"'));
    assert.ok(note.includes("Escape"));
    assert.ok(note.includes("onClose"));
    assert.ok(note.includes("data-4663-intro-close"));
  });

  it("PlayHTML movable ids and mounts remain unchanged", () => {
    assert.equal(PLAYHTML_LOGO_ID, "4663-logo");
    assert.equal(PLAYHTML_HERO_TITLE_ID, "4663-hero-title");
    assert.equal(PLAYHTML_HERO_SUBTITLE_ID, "4663-hero-subtitle");

    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("id={PLAYHTML_WORLD_BOUNDS_ID}"));
    assert.equal(surface.includes("MovableLogo"), false);
    assert.equal(surface.includes("MovableHero"), false);

    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("BrandAnchors"));
    assert.equal(chrome.includes("CanMoveElement"), false);
    assert.equal(chrome.includes("PlayProvider"), false);
    assert.equal(chrome.includes(PLAYHTML_LOGO_ID), false);
  });
});
