/**
 * Top-right username + X identity cluster — compact vs desktop chrome.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  isCompactCanvasChrome,
  isDesktopCanvasChrome,
} from "@/lib/canvas/canvas-chrome-layout";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const VIEWPORTS = {
  phonePortrait: { width: 390, hoverHover: false, pointerFine: false },
  phoneLandscape: { width: 844, hoverHover: false, pointerFine: false },
  ipadPortrait: { width: 820, hoverHover: false, pointerFine: false },
  ipadLandscape: { width: 1180, hoverHover: false, pointerFine: false },
  ipadProCoarse: { width: 1024, hoverHover: false, pointerFine: false },
  desktop: { width: 1440, hoverHover: true, pointerFine: true },
} as const;

describe("top-right username + X chrome", () => {
  it("identity cluster is top-right with safe-area; ENTER stays in the hero slot", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("data-4663-chrome-identity"));
    assert.ok(chrome.includes("CanvasXLink"));
    assert.ok(chrome.includes("ParticipationSessionControl"));
    assert.ok(chrome.includes("safe-area-inset-top"));
    assert.ok(chrome.includes("safe-area-inset-right"));
    assert.ok(chrome.includes("desktop-chrome:top-6 desktop-chrome:right-6"));
    assert.equal(chrome.includes("sm:top-6 sm:right-6"), false);
    assert.equal(chrome.includes("TapDebugPanel"), false);

    const identity = chrome.slice(
      chrome.indexOf("data-4663-chrome-top-right"),
      chrome.indexOf("data-4663-chrome-presence"),
    );
    assert.ok(identity.includes("data-4663-chrome-identity"));
    assert.ok(identity.indexOf("CanvasXLink") < identity.indexOf("CanvasToneControl"));
    assert.ok(chrome.includes('className="pointer-events-none absolute top-[max(1.25rem,env(safe-area-inset-top,0px))]'));
  });

  it("top-right wrappers are pointer-events-none; controls are pointer-events-auto", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    const topRight = chrome.slice(
      chrome.indexOf("data-4663-chrome-top-right") - 200,
      chrome.indexOf("data-4663-chrome-presence"),
    );
    assert.ok(topRight.includes("pointer-events-none absolute"));
    assert.ok(topRight.includes("pointer-events-auto flex items-center"));

    const intro = readSrc("src/components/canvas/canvas-intro-trigger.tsx");
    assert.ok(intro.includes("pointer-events-auto"));
  });

  it("phone / iPad stay compact; fine-pointer 1440 is desktop", () => {
    assert.equal(isCompactCanvasChrome(VIEWPORTS.phonePortrait), true);
    assert.equal(isCompactCanvasChrome(VIEWPORTS.phoneLandscape), true);
    assert.equal(isCompactCanvasChrome(VIEWPORTS.ipadPortrait), true);
    assert.equal(isCompactCanvasChrome(VIEWPORTS.ipadLandscape), true);
    assert.equal(isCompactCanvasChrome(VIEWPORTS.ipadProCoarse), true);
    assert.equal(isDesktopCanvasChrome(VIEWPORTS.desktop), true);
  });
});
