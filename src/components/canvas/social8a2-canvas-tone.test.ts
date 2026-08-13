/**
 * Social 8A.2 — canvas tone chrome structural tests.
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

describe("Social 8A.2 canvas tone chrome placement", () => {
  it("top-right stack is CANVAS above WHAT IS THIS above WHAT CAN YOU DO", () => {
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
  });

  it("hero uses canvas fg/muted vars for tone readability", () => {
    const hero = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.ok(hero.includes("--canvas-fg"));
    assert.ok(hero.includes("--canvas-muted"));
  });
});
