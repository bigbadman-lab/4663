/**
 * IC3.7 — prevent mobile browser focus-zoom on TEXT/DRAW create inputs.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  MOBILE_SAFE_COMPOSER_INPUT_CLASS,
  worldScaleCounterScale,
} from "@/lib/canvas/mobile-form-control";
import { homeFitScaleForViewport } from "@/lib/canvas/world-camera";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("IC3.7 mobile input focus zoom", () => {
  it("1. mobile TEXT input font size is ≥16px (text-base); desktop stays 12px", () => {
    assert.equal(MOBILE_SAFE_COMPOSER_INPUT_CLASS, "text-base sm:text-[12px]");
    const composer = readSrc(
      "src/components/social/ephemeral-text-composer.tsx",
    );
    assert.ok(composer.includes("MOBILE_SAFE_COMPOSER_INPUT_CLASS"));
    assert.ok(composer.includes("data-4663-ephemeral-text-input"));
    // Must not hardcode sub-16 mobile-only type on the focused control.
    assert.equal(
      /textarea[\s\S]*?className=\{`[^`]*text-\[1[0-5]px\]/.test(composer),
      false,
    );
  });

  it("2. DRAW has no focused text input (surface + buttons only)", () => {
    const draw = readSrc("src/components/social/drawing-session-editor.tsx");
    assert.equal(draw.includes("<textarea"), false);
    assert.equal(draw.includes("<input"), false);
    assert.ok(draw.includes("data-4663-drawing-surface"));
    assert.ok(draw.includes("touch-none"));
  });

  it("3. desktop typography remains sm:text-[12px] via shared class", () => {
    assert.ok(MOBILE_SAFE_COMPOSER_INPUT_CLASS.includes("sm:text-[12px]"));
  });

  it("4–6. focus does not mutate camera / HOME / scale recovery", () => {
    const composer = readSrc(
      "src/components/social/ephemeral-text-composer.tsx",
    );
    assert.equal(composer.includes("goHome"), false);
    assert.equal(composer.includes("applyCamera"), false);
    assert.equal(
      composer.includes("normalizeCameraToScaleOnePreservingCenter"),
      false,
    );
    assert.equal(composer.includes("homeCameraForViewport"), false);
    assert.ok(composer.includes("focus({ preventScroll: true })"));
    assert.equal(composer.includes("scrollIntoView"), false);
  });

  it("7–8. TEXT/DRAW still publish via world % (no coordinate redesign)", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("leftPct={createUi.leftPct}"));
    assert.ok(layer.includes("topPct={createUi.topPct}"));
    assert.ok(layer.includes("createEphemeralTextObject"));
    assert.ok(layer.includes("createEphemeralDrawingObject"));
    const composer = readSrc(
      "src/components/social/ephemeral-text-composer.tsx",
    );
    assert.ok(composer.includes("left: `${leftPct}%`"));
    assert.ok(composer.includes("top: `${topPct}%`"));
    const draw = readSrc("src/components/social/drawing-session-editor.tsx");
    assert.ok(draw.includes("left: `${leftPct}%`"));
    assert.ok(draw.includes("width: `${widthPct}%`"));
  });

  it("9. keyboard/visual viewport: resize path stays clamp-only", () => {
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(cam.includes("ResizeObserver"));
    assert.ok(cam.includes("clampCamera"));
    assert.equal(cam.includes("visualViewport"), false);
    assert.ok(
      cam.includes("do not reapply fitted scale") ||
        cam.includes("Clamp only"),
    );
  });

  it("10. no global viewport zoom-disabling meta", () => {
    const layout = readSrc("src/app/layout.tsx");
    assert.equal(layout.includes("user-scalable=no"), false);
    assert.equal(layout.includes("maximum-scale"), false);
    assert.equal(layout.includes("minimum-scale"), false);
    const pkg = readSrc("package.json");
    assert.equal(pkg.includes("user-scalable"), false);
  });

  it("11. ENTER/name input already uses text-base on mobile", () => {
    const form = readSrc("src/components/social/participation-enter-form.tsx");
    assert.ok(form.includes("text-base"));
    assert.ok(form.includes("sm:text-[13px]"));
    assert.ok(form.includes("data-4663-participation-name-input"));
    // Modal is outside the world transform (chrome sibling).
    assert.ok(form.includes("fixed inset-0"));
  });

  it("12. world scale contributes — counter-scale restores screen size", () => {
    const fit = homeFitScaleForViewport(390, 844);
    assert.ok(fit < 1);
    const counter = worldScaleCounterScale(fit);
    assert.ok(Math.abs(counter * fit - 1) < 1e-9);
    assert.equal(worldScaleCounterScale(1), 1);

    // 12px * fit < 16 → proves font-only fix is insufficient under fit scale.
    assert.ok(12 * fit < 16);
    // 16px after counter-scale → effective screen size ≈ 16.
    assert.ok(16 * fit * counter >= 16 - 1e-9);

    const composer = readSrc(
      "src/components/social/ephemeral-text-composer.tsx",
    );
    assert.ok(composer.includes("worldScaleCounterScale"));
    assert.ok(composer.includes("getCanvasPlacementSnapshot"));
    assert.ok(composer.includes("data-4663-composer-counter-scale"));
    // Temporary create UI only — not a full screen-space portal rewrite.
    assert.equal(composer.includes("createPortal"), false);
    assert.equal(composer.includes("fixed inset"), false);
  });

  it("desktop create flow wiring unchanged", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("EphemeralTextComposer"));
    assert.ok(layer.includes("DrawingSessionEditor"));
    assert.ok(layer.includes("onPublish={publish}"));
  });
});
