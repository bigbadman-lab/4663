/**
 * Compact vs genuine desktop canvas chrome classification.
 * Mirrors the `desktop-chrome:` CSS media query — not a UA detector.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  COMPACT_CORNER_CHROME_BOTTOM,
  COMPACT_DOCK_BOTTOM_CLEARANCE,
  COMPACT_LOGO_MIN_INSET,
  DESKTOP_CHROME_MEDIA_QUERY,
  DESKTOP_CHROME_MIN_WIDTH_PX,
  DESKTOP_CHROME_VARIANT,
  DESKTOP_DOCK_BOTTOM_CLEARANCE,
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

function remPx(value: `${number}rem`): number {
  return Number.parseFloat(value) * 16;
}

const PHONE = { width: 390, height: 844 } as const;
const IPAD_PORTRAIT = { width: 820, height: 1180 } as const;
const IPAD_LANDSCAPE = { width: 1180, height: 820 } as const;
const IPAD_PRO_PORTRAIT = { width: 1024, height: 1366 } as const;
const DESKTOP_1280 = { width: 1280, height: 800 } as const;
const DESKTOP_1440 = { width: 1440, height: 900 } as const;

describe("canvas chrome layout classification", () => {
  it("desktop chrome requires width >= 1280, hover:hover, and pointer:fine", () => {
    assert.equal(DESKTOP_CHROME_MIN_WIDTH_PX, 1280);
    assert.equal(
      DESKTOP_CHROME_MEDIA_QUERY,
      "(min-width: 1280px) and (hover: hover) and (pointer: fine)",
    );
    assert.equal(DESKTOP_CHROME_VARIANT, "desktop-chrome");
  });

  it("CSS variant matches the geometry + capability query", () => {
    const css = readSrc("src/app/globals.css");
    assert.ok(css.includes(`@custom-variant ${DESKTOP_CHROME_VARIANT}`));
    assert.ok(css.includes(DESKTOP_CHROME_MEDIA_QUERY));
    assert.equal(css.includes("iPad"), false);
  });

  it("1. iPhone 390×844 remains compact", () => {
    assert.equal(
      isCompactCanvasChrome({
        width: PHONE.width,
        hoverHover: false,
        pointerFine: false,
      }),
      true,
    );
    assert.equal(
      isDesktopCanvasChrome({
        width: PHONE.width,
        hoverHover: false,
        pointerFine: false,
      }),
      false,
    );
  });

  it("2. iPad portrait 820×1180 remains compact", () => {
    assert.equal(
      isCompactCanvasChrome({
        width: IPAD_PORTRAIT.width,
        hoverHover: false,
        pointerFine: false,
      }),
      true,
    );
    assert.equal(
      isDesktopCanvasChrome({
        width: IPAD_PORTRAIT.width,
        hoverHover: true,
        pointerFine: true,
      }),
      false,
    );
  });

  it("3. iPad landscape 1180×820 remains compact", () => {
    assert.equal(
      isCompactCanvasChrome({
        width: IPAD_LANDSCAPE.width,
        hoverHover: false,
        pointerFine: false,
      }),
      true,
    );
    assert.equal(
      isDesktopCanvasChrome({
        width: IPAD_LANDSCAPE.width,
        hoverHover: true,
        pointerFine: true,
      }),
      false,
    );
  });

  it("4. iPad Pro portrait 1024×1366 remains compact", () => {
    assert.equal(
      isCompactCanvasChrome({
        width: IPAD_PRO_PORTRAIT.width,
        hoverHover: false,
        pointerFine: false,
      }),
      true,
    );
  });

  it("5. 1440×900 desktop + fine pointer gets desktop chrome", () => {
    assert.equal(
      isDesktopCanvasChrome({
        width: DESKTOP_1440.width,
        hoverHover: true,
        pointerFine: true,
      }),
      true,
    );
  });

  it("6. 1280×800 desktop + fine pointer meets the new threshold", () => {
    assert.equal(
      isDesktopCanvasChrome({
        width: DESKTOP_1280.width,
        hoverHover: true,
        pointerFine: true,
      }),
      true,
    );
    assert.equal(
      isDesktopCanvasChrome({
        width: DESKTOP_1280.width,
        hoverHover: false,
        pointerFine: true,
      }),
      false,
    );
    assert.equal(
      isDesktopCanvasChrome({
        width: DESKTOP_1280.width,
        hoverHover: true,
        pointerFine: false,
      }),
      false,
    );
  });

  it("compact dock clearance sits above presence/clock band", () => {
    assert.equal(COMPACT_DOCK_BOTTOM_CLEARANCE, "5.75rem");
    assert.equal(DESKTOP_DOCK_BOTTOM_CLEARANCE, "3.75rem");
    assert.equal(COMPACT_CORNER_CHROME_BOTTOM, "1.25rem");
    assert.ok(
      remPx(COMPACT_DOCK_BOTTOM_CLEARANCE) >
        remPx(COMPACT_CORNER_CHROME_BOTTOM),
    );
  });

  it("compact logo min inset is independent of empty safe-area", () => {
    assert.equal(COMPACT_LOGO_MIN_INSET, "2.5rem");
  });
});
