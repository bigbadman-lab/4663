/**
 * Stage 8A.11 — Mobile ENTER participation modal layout.
 * Logic/validation unchanged; desktop panel classes preserved via sm: overrides.
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

describe("Stage 8A.11 mobile ENTER modal", () => {
  it("1. ENTER opens the same ParticipationEnterForm modal", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("ParticipationEnterTrigger"));
    assert.ok(chrome.includes("openEnter"));
    assert.ok(chrome.includes("enterOpen"));
    assert.ok(chrome.includes("<ParticipationEnterForm"));
    assert.ok(chrome.includes("onEnter={enter}"));

    const form = readSrc("src/components/social/participation-enter-form.tsx");
    assert.ok(form.includes('data-4663-participation-enter-form'));
    assert.ok(form.includes('data-4663-participation-enter-backdrop'));
  });

  it("2–4. mobile width/max-height/dvh + internal scroll", () => {
    const form = readSrc("src/components/social/participation-enter-form.tsx");
    assert.ok(form.includes("max-w-[min(24rem,calc(100vw-1.5rem))]"));
    assert.ok(form.includes("100dvh"));
    assert.ok(form.includes("max-h-[calc(100dvh-"));
    assert.ok(form.includes("overflow-y-auto"));
    assert.ok(form.includes("overscroll-contain"));
  });

  it("5–7. input full-width/usable; action + close accessible", () => {
    const form = readSrc("src/components/social/participation-enter-form.tsx");
    assert.ok(form.includes("data-4663-participation-name-input"));
    assert.ok(form.includes("w-full"));
    assert.ok(form.includes("text-base"));
    assert.ok(form.includes("data-4663-participation-enter-submit"));
    assert.ok(form.includes("data-4663-participation-enter-close"));
    assert.ok(form.includes("min-h-11"));
    assert.ok(form.includes('aria-label="Close"'));
  });

  it("8. safe-area styling on backdrop", () => {
    const form = readSrc("src/components/social/participation-enter-form.tsx");
    assert.ok(form.includes("safe-area-inset-top"));
    assert.ok(form.includes("safe-area-inset-bottom"));
    assert.ok(form.includes("safe-area-inset-left"));
    assert.ok(form.includes("safe-area-inset-right"));
  });

  it("9. backdrop blocks canvas interaction; outside world transform", () => {
    const form = readSrc("src/components/social/participation-enter-form.tsx");
    assert.ok(form.includes("fixed inset-0 z-30"));
    assert.ok(form.includes("stopPropagation"));
    assert.ok(form.includes('document.body.style.overflow = "hidden"'));

    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("ParticipationEnterForm"));
    const play = readSrc("src/components/canvas/canvas-play-tree.tsx");
    assert.ok(play.includes("<CanvasChrome />"));
    assert.ok(play.includes("<CanvasSurface"));
    // Chrome (modal host) is a sibling of the camera surface, not inside world.
    const chromeIdx = play.indexOf("<CanvasChrome");
    const surfaceIdx = play.indexOf("<CanvasSurface");
    assert.ok(chromeIdx >= 0 && surfaceIdx > chromeIdx);

    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.equal(surface.includes("ParticipationEnterForm"), false);
    assert.ok(surface.includes("data-4663-canvas-world"));
  });

  it("10. desktop styling preserved via sm: overrides", () => {
    const form = readSrc("src/components/social/participation-enter-form.tsx");
    assert.ok(form.includes("sm:max-w-md"));
    assert.ok(form.includes("sm:px-6"));
    assert.ok(form.includes("sm:py-6"));
    assert.ok(form.includes("sm:p-6"));
    assert.ok(form.includes("sm:max-h-none"));
    assert.ok(form.includes("sm:overflow-visible"));
    assert.ok(form.includes("sm:text-[13px]"));
  });

  it("11–13. submission/validation and camera untouched", () => {
    const form = readSrc("src/components/social/participation-enter-form.tsx");
    assert.ok(form.includes("onEnter(name)"));
    assert.ok(form.includes("DISPLAY_NAME_MAX_LENGTH"));
    assert.ok(form.includes('event.key === "Enter"'));
    assert.equal(form.includes("validateDisplayName"), false);
    assert.equal(form.includes("useCanvasCamera"), false);
    assert.equal(form.includes("goHome"), false);
    assert.equal(form.includes("CanMoveElement"), false);

    const session = readSrc("src/lib/social/participation-session.ts");
    assert.ok(session.includes("validateDisplayName"));

    const controller = readSrc("src/lib/social/participation-controller.ts");
    assert.ok(controller.includes("enter(displayName: string)"));
  });
});
