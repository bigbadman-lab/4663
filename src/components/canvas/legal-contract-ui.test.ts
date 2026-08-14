/**
 * LEGAL modal + official contract relocation structural tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_LAST_UPDATED,
} from "@/components/canvas/canvas-legal-note";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("LEGAL modal + info stack", () => {
  it("[ LEGAL ] sits in the top-right info stack after WHAT CAN YOU DO?", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    const block = chrome.slice(
      chrome.indexOf("data-4663-chrome-top-right"),
      chrome.indexOf("data-4663-chrome-presence"),
    );
    assert.ok(block.includes("CanvasIntroTrigger"));
    assert.ok(block.includes("CanvasGuideTrigger"));
    assert.ok(block.includes("CanvasLegalTrigger"));
    assert.ok(
      block.indexOf("CanvasGuideTrigger") < block.indexOf("CanvasLegalTrigger"),
    );
    assert.equal(block.includes("OfficialContractControl"), false);

    const trigger = readSrc("src/components/canvas/canvas-legal-trigger.tsx");
    assert.ok(trigger.includes("[ LEGAL ]"));
    assert.ok(trigger.includes("data-4663-legal-trigger"));
  });

  it("infoModal exclusivity includes legal; opens CanvasLegalNote", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(
      chrome.includes('type InfoModal = null | "intro" | "guide" | "legal"'),
    );
    assert.ok(chrome.includes('setInfoModal("legal")'));
    assert.ok(chrome.includes('infoModal === "legal"'));
    assert.ok(chrome.includes("<CanvasLegalNote"));
    assert.equal((chrome.match(/infoModal ===/g) ?? []).length, 3);
  });

  it("legal modal has title, sections, contact, close/Escape, mobile scroll", () => {
    const note = readSrc("src/components/canvas/canvas-legal-note.tsx");
    assert.equal(LEGAL_CONTACT_EMAIL, "hi@4663.live");
    assert.equal(LEGAL_LAST_UPDATED, "Last updated: August 2026");
    assert.ok(note.includes("4663 // LEGAL"));
    assert.ok(note.includes(LEGAL_LAST_UPDATED));
    assert.ok(note.includes("DISCLAIMER"));
    assert.ok(note.includes("PRIVACY"));
    assert.ok(note.includes("TERMS"));
    assert.ok(note.includes(LEGAL_CONTACT_EMAIL));
    assert.ok(note.includes("mailto:${LEGAL_CONTACT_EMAIL}"));
    assert.ok(note.includes("mailto:"));
    assert.ok(note.includes("Questions about these terms or your privacy?"));
    assert.ok(note.includes('role="dialog"'));
    assert.ok(note.includes("Escape"));
    assert.ok(note.includes("data-4663-legal-close"));
    assert.ok(note.includes("overflow-y-auto"));
    assert.ok(note.includes("safe-area-inset-top"));
    assert.ok(note.includes("100dvh"));

    assert.ok(note.includes("financial, investment, trading, legal or tax advice"));
    assert.ok(note.includes("not a recommendation, endorsement or signal to buy"));
    assert.ok(note.includes("does not require accounts, passwords or sign-ups"));
    assert.ok(note.includes("should be treated as public"));
    assert.ok(note.includes("coarse location"));
    assert.ok(note.includes("does not store your IP address"));
    assert.ok(note.includes("approximately 24 hours"));
  });
});

describe("Official contract bottom-right relocation", () => {
  it("contract is in bottom-right utility cluster, not top-right", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    const top = chrome.slice(
      chrome.indexOf("data-4663-chrome-top-right"),
      chrome.indexOf("data-4663-chrome-presence"),
    );
    assert.equal(top.includes("OfficialContractControl"), false);

    assert.ok(chrome.includes("data-4663-chrome-bottom-right"));
    assert.ok(chrome.includes("data-4663-chrome-clock"));
    assert.ok(chrome.includes("OfficialContractControl"));
    assert.ok(chrome.includes("CanvasLiveClock"));
    assert.ok(chrome.includes("officialToken?.active"));
    assert.ok(
      chrome.indexOf("data-4663-chrome-bottom-right") <
        chrome.indexOf("<OfficialContractControl"),
    );
    assert.ok(
      chrome.indexOf("<OfficialContractControl") <
        chrome.indexOf("<CanvasLiveClock"),
    );
  });

  it("desktop $4663 CONTRACT / mobile $4663; copy still uses full address", () => {
    const control = readSrc(
      "src/components/canvas/official-contract-control.tsx",
    );
    assert.ok(control.includes("[ $4663 CONTRACT ]"));
    assert.ok(control.includes("[ $4663 ]"));
    assert.ok(control.includes("sm:hidden"));
    assert.ok(control.includes("hidden sm:inline"));
    assert.ok(control.includes("copyTextQuiet(contractAddress)"));
    assert.ok(control.includes("[ COPIED ]"));
    assert.ok(control.includes("if (!ok) return"));
    assert.equal(control.includes("[ OFFICIAL CONTRACT ]"), false);
    assert.ok(
      control.includes('aria-label="Copy official $4663 token contract"'),
    );

    const palette = readSrc(
      "src/components/canvas/canvas-control-palette.tsx",
    );
    assert.ok(
      palette.includes("5.75rem"),
      "mobile dock clears taller contract+clock cluster",
    );

    const hook = readSrc("src/components/canvas/use-official-token.ts");
    assert.ok(hook.includes("startOfficialTokenPolling"));
    assert.ok(hook.includes("fetchOfficialTokenJson"));
  });
});
