/**
 * Stage 8A.12 — WHAT CAN YOU DO? field-guide modal.
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

const REQUIRED_HEADINGS = [
  "EXPLORE THE CANVAS",
  "BE HERE WITH EVERYONE",
  "WATCH ROBINHOOD CHAIN",
  "EXPLORE CRYPTO",
  "BUILD WITH US",
] as const;

const REMOVED_HEADINGS = [
  "MOVE AROUND",
  "MOVE THINGS",
  "LEAVE TEXT",
  "SHARE A CONTRACT",
  "DRAW",
  "FOLLOW WHAT'S HAPPENING ON PONS",
  "WATCH",
  "PIN",
  "SUMMON",
  "HOME",
  "RESET",
  "NO ACCOUNTS. NO SIGN-UP.",
  "SEE PEOPLE LIVE",
  "FIND WHAT'S INTERESTING",
  "BUILD ON THE CANVAS",
] as const;

describe("Stage 8A.12 WHAT CAN YOU DO modal", () => {
  it("1. WHAT CAN YOU DO? appears below WHAT IS THIS?", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    const block = chrome.slice(
      chrome.indexOf("data-4663-chrome-top-right"),
      chrome.indexOf("data-4663-chrome-presence"),
    );
    assert.ok(block.includes("CanvasToneControl"));
    assert.ok(block.includes("CanvasIntroTrigger"));
    assert.ok(block.includes("CanvasGuideTrigger"));
    assert.ok(
      block.indexOf("CanvasToneControl") < block.indexOf("CanvasIntroTrigger"),
    );
    assert.ok(
      block.indexOf("CanvasIntroTrigger") < block.indexOf("CanvasGuideTrigger"),
    );

    const trigger = readSrc("src/components/canvas/canvas-guide-trigger.tsx");
    assert.ok(trigger.includes("[ WHAT CAN YOU DO? ]"));
    assert.ok(trigger.includes('type="button"'));
    assert.ok(trigger.includes("data-4663-guide-trigger"));
  });

  it("2–4. clicking opens modal with correct title and intro", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes('setInfoModal("guide")'));
    assert.ok(chrome.includes('infoModal === "guide"'));
    assert.ok(chrome.includes("<CanvasGuideNote"));

    const note = readSrc("src/components/canvas/canvas-guide-note.tsx");
    assert.ok(note.includes("WHAT CAN YOU DO?"));
    assert.ok(
      note.includes("4663 is a live canvas shared with everyone here."),
    );
    assert.ok(note.includes('role="dialog"'));
    assert.ok(note.includes('aria-modal="true"'));
    assert.ok(note.includes("data-4663-guide-note"));
  });

  it("5–7. guide sections name current controls; SUMMON absent", () => {
    const note = readSrc("src/components/canvas/canvas-guide-note.tsx");
    for (const heading of REQUIRED_HEADINGS) {
      assert.ok(note.includes(heading), `missing heading: ${heading}`);
    }
    for (const heading of REMOVED_HEADINGS) {
      assert.equal(
        note.includes(`heading: "${heading}"`),
        false,
        `legacy heading still present: ${heading}`,
      );
    }
    assert.ok(note.includes("ENTER"));
    assert.ok(note.includes("GLOBAL CHAT"));
    assert.ok(note.includes("CRYPTO"));
    assert.ok(note.includes("last 5"));
    assert.equal(note.includes("SUMMON"), false);
    assert.ok(
      note.includes(
        "This isn't a signal to buy. It's something to investigate.",
      ),
    );
    assert.ok(note.includes("not signals to buy"));
  });

  it("8–9. accounts copy lives in BE HERE WITH EVERYONE; no over-strong privacy claim", () => {
    const note = readSrc("src/components/canvas/canvas-guide-note.tsx");
    assert.ok(note.includes("No account or sign-up required."));
    assert.ok(note.includes("Choose ENTER to give yourself a temporary name."));
    assert.equal(note.includes("NO ACCOUNTS. NO SIGN-UP."), false);
    assert.equal(note.includes("no data saved whatsoever"), false);
    assert.equal(note.includes("No user data stored"), false);
  });

  it("10–11. modal can close; only one info modal at a time", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes('type InfoModal = null | "intro" | "guide"'));
    assert.ok(chrome.includes('infoModal === "intro"'));
    assert.ok(chrome.includes('infoModal === "guide"'));
    // Mutual exclusion: both cannot render together.
    assert.equal(
      chrome.includes('infoModal === "intro"') &&
        chrome.includes('infoModal === "guide"'),
      true,
    );
    assert.ok(chrome.includes("closeInfo"));
    assert.equal((chrome.match(/infoModal ===/g) ?? []).length, 2);

    const note = readSrc("src/components/canvas/canvas-guide-note.tsx");
    assert.ok(note.includes("Escape"));
    assert.ok(note.includes("data-4663-guide-close"));
    assert.ok(note.includes('aria-label="Close"'));
    assert.ok(note.includes("onClose"));
  });

  it("12–13. mobile internally scrollable; backdrop blocks canvas", () => {
    const note = readSrc("src/components/canvas/canvas-guide-note.tsx");
    assert.ok(note.includes("100dvh"));
    assert.ok(note.includes("max-h-[calc(100dvh-"));
    assert.ok(note.includes("overflow-y-auto"));
    assert.ok(note.includes("overscroll-contain"));
    assert.ok(note.includes("safe-area-inset-top"));
    assert.ok(note.includes("safe-area-inset-bottom"));
    assert.ok(note.includes("fixed inset-0 z-30"));
    assert.ok(note.includes("stopPropagation"));
    assert.ok(note.includes('document.body.style.overflow = "hidden"'));
    assert.ok(note.includes("data-4663-guide-backdrop"));
  });

  it("14. camera/world/shared state untouched", () => {
    const note = readSrc("src/components/canvas/canvas-guide-note.tsx");
    const trigger = readSrc("src/components/canvas/canvas-guide-trigger.tsx");
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    for (const src of [note, trigger, chrome]) {
      assert.equal(src.includes("homeCameraForViewport"), false);
      assert.equal(src.includes("setData"), false);
      assert.equal(src.includes("supabase"), false);
      assert.equal(src.includes("CanMoveElement"), false);
      assert.equal(src.includes("requestLocalHomeView"), false);
    }
  });

  it("15. WHAT IS THIS? reflects Web3 tools + chat copy", () => {
    const intro = readSrc("src/components/canvas/canvas-intro-note.tsx");
    assert.ok(intro.includes("Web3 tools built in"));
    assert.ok(intro.includes("move things, chat"));
    assert.ok(intro.includes("Part canvas. Part network. Part machine."));
    assert.ok(intro.includes("Welcome to 4663."));
    assert.ok(intro.includes("data-4663-intro-note"));

    const introTrigger = readSrc(
      "src/components/canvas/canvas-intro-trigger.tsx",
    );
    assert.ok(introTrigger.includes("[ WHAT IS THIS? ]"));

    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("CanvasIntroTrigger"));
    assert.ok(chrome.includes("CanvasIntroNote"));
    assert.ok(chrome.includes('setInfoModal("intro")'));
  });
});
