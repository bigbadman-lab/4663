/**
 * iPad viewport chrome — compact chrome at tablet widths; camera stays scale 1.
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
  DESKTOP_CHROME_VARIANT,
  DESKTOP_DOCK_BOTTOM_CLEARANCE,
  isCompactCanvasChrome,
  isDesktopCanvasChrome,
} from "@/lib/canvas/canvas-chrome-layout";
import { BRAND_LOGO_STYLE } from "@/lib/canvas/hero";
import {
  HOME_REGION_LEFT_PX,
  HOME_REGION_TOP_PX,
  homeCameraForViewport,
  homeFitScaleForViewport,
  initialHomeCameraForViewport,
} from "@/lib/canvas/world-camera";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  ipadPortrait: { width: 820, height: 1180 },
  ipadLandscape: { width: 1180, height: 820 },
  ipadProPortrait: { width: 1024, height: 1366 },
  desktop1280: { width: 1280, height: 800 },
  desktop1440: { width: 1440, height: 900 },
} as const;

describe("IC3 iPad home chrome (layout only)", () => {
  it("classifies fixtures: phone/tablet compact; 1280/1440 fine-pointer desktop", () => {
    const coarse = { hoverHover: false, pointerFine: false };
    const desktopPointer = { hoverHover: true, pointerFine: true };

    assert.equal(
      isCompactCanvasChrome({ ...coarse, width: VIEWPORTS.phone.width }),
      true,
    );
    assert.equal(
      isCompactCanvasChrome({
        ...coarse,
        width: VIEWPORTS.ipadPortrait.width,
      }),
      true,
    );
    assert.equal(
      isCompactCanvasChrome({
        ...coarse,
        width: VIEWPORTS.ipadLandscape.width,
      }),
      true,
    );
    assert.equal(
      isCompactCanvasChrome({
        ...coarse,
        width: VIEWPORTS.ipadProPortrait.width,
      }),
      true,
    );
    assert.equal(
      isDesktopCanvasChrome({
        ...desktopPointer,
        width: VIEWPORTS.desktop1280.width,
      }),
      true,
    );
    assert.equal(
      isDesktopCanvasChrome({
        ...desktopPointer,
        width: VIEWPORTS.desktop1440.width,
      }),
      true,
    );
  });

  it("7. tablet does not inherit sm: desktop dock clearance", () => {
    const palette = readSrc(
      "src/components/canvas/canvas-control-palette.tsx",
    );
    assert.equal(
      palette.includes(
        "sm:pb-[calc(env(safe-area-inset-bottom,0px)+3.75rem)]",
      ),
      false,
    );
    assert.ok(
      palette.includes(
        `pb-[calc(env(safe-area-inset-bottom,0px)+${COMPACT_DOCK_BOTTOM_CLEARANCE})]`,
      ),
    );
    assert.ok(
      palette.includes(
        `${DESKTOP_CHROME_VARIANT}:pb-[calc(env(safe-area-inset-bottom,0px)+${DESKTOP_DOCK_BOTTOM_CLEARANCE})]`,
      ),
    );
    assert.equal(palette.includes("sm:min-h-14"), false);
    assert.equal(palette.includes("sm:h-8"), false);
  });

  it("8. compact presence/clock and dock occupy separate bottom bands", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    const palette = readSrc(
      "src/components/canvas/canvas-control-palette.tsx",
    );

    assert.ok(chrome.includes("PresenceStatus"));
    assert.ok(chrome.includes("CanvasLiveClock"));
    assert.ok(chrome.includes("data-4663-chrome-presence"));
    assert.ok(chrome.includes("data-4663-chrome-clock"));

    assert.ok(chrome.includes("bottom-5 left-5"));
    assert.ok(chrome.includes(`bottom-[max(${COMPACT_CORNER_CHROME_BOTTOM}`));
    assert.ok(
      chrome.includes("max-w-[min(16rem,calc(50%-0.75rem))]"),
    );
    assert.ok(
      chrome.includes("max-w-[min(11.5rem,calc(50%-0.75rem))]"),
    );

    assert.equal(chrome.includes("sm:bottom-6"), false);
    assert.ok(chrome.includes(`${DESKTOP_CHROME_VARIANT}:bottom-6`));

    const compactDockPb = Number.parseFloat(COMPACT_DOCK_BOTTOM_CLEARANCE);
    const cornerBottom = Number.parseFloat(COMPACT_CORNER_CHROME_BOTTOM);
    assert.ok(compactDockPb > cornerBottom);

    assert.ok(palette.includes(COMPACT_DOCK_BOTTOM_CLEARANCE));
    assert.ok(chrome.includes("<PresenceStatus"));
    assert.ok(chrome.includes("<CanvasLiveClock"));
  });

  it("9. logo tablet styling does not depend on sm: desktop sizing", () => {
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.ok(brand.includes("h-16 w-16"));
    assert.equal(brand.includes("sm:h-[72px]"), false);
    assert.equal(brand.includes("sm:w-[72px]"), false);
    assert.ok(brand.includes(`${DESKTOP_CHROME_VARIANT}:h-[72px]`));
    assert.ok(brand.includes(`${DESKTOP_CHROME_VARIANT}:w-[72px]`));
    assert.ok(BRAND_LOGO_STYLE.top.includes(COMPACT_LOGO_MIN_INSET));
    assert.ok(BRAND_LOGO_STYLE.top.includes("safe-area-inset-top"));
    assert.ok(BRAND_LOGO_STYLE.top.startsWith("max("));
  });

  it("10. hero tablet styling does not become desktop solely at 640px", () => {
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.ok(brand.includes("text-5xl"));
    assert.equal(brand.includes("sm:text-6xl"), false);
    assert.ok(brand.includes(`${DESKTOP_CHROME_VARIANT}:text-6xl`));
    assert.equal(brand.includes("sm:text-xs"), false);
    assert.ok(brand.includes(`${DESKTOP_CHROME_VARIANT}:text-xs`));
    assert.ok(brand.includes("top-[42%]"));
    assert.ok(brand.includes("top-[52%]"));
  });

  it("11. camera remains scale 1; 1440×900 HOME is (1680, 1150)", () => {
    for (const vp of Object.values(VIEWPORTS)) {
      const home = homeCameraForViewport(vp.width, vp.height);
      const initial = initialHomeCameraForViewport(vp.width, vp.height);
      assert.equal(home.scale, 1);
      assert.equal(initial.scale, 1);
      assert.equal(homeFitScaleForViewport(vp.width, vp.height), 1);
    }

    const desktopHome = homeCameraForViewport(1440, 900);
    assert.equal(desktopHome.scale, 1);
    assert.equal(desktopHome.x, 1680);
    assert.equal(desktopHome.y, 1150);
    assert.equal(desktopHome.x, HOME_REGION_LEFT_PX);
    assert.equal(desktopHome.y, HOME_REGION_TOP_PX);

    const worldCam = readSrc("src/lib/canvas/world-camera.ts");
    assert.ok(worldCam.includes("export function homeCameraForViewport"));
    assert.ok(worldCam.includes("export function initialHomeCameraForViewport"));
    assert.ok(worldCam.includes("export function frameHomeCameraForViewport"));
    assert.ok(worldCam.includes("export function homeFitScaleForViewport"));
  });

  it("12. BrandAnchors / dock remain outside #4663-world", () => {
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.equal(surface.includes("BrandAnchors"), false);
    assert.ok(surface.includes("id={PLAYHTML_WORLD_BOUNDS_ID}"));
    assert.ok(surface.includes("<CanvasControlPalette"));
    const worldStyle = surface.indexOf('data-4663-canvas-world');
    const paletteMount = surface.indexOf("<CanvasControlPalette");
    assert.ok(worldStyle >= 0 && paletteMount > worldStyle);

    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("BrandAnchors"));
    assert.equal(chrome.includes("PLAYHTML_WORLD_BOUNDS_ID"), false);

    const play = readSrc("src/components/canvas/canvas-play-tree.tsx");
    assert.ok(play.indexOf("<CanvasChrome") < play.indexOf("<CanvasSurface"));
  });

  it("does not use UA strings or revive zoom-to-fit chrome", () => {
    for (const rel of [
      "src/components/canvas/canvas-chrome.tsx",
      "src/components/canvas/brand-anchors.tsx",
      "src/components/canvas/canvas-control-palette.tsx",
      "src/lib/canvas/canvas-chrome-layout.ts",
      "src/app/globals.css",
    ]) {
      const src = readSrc(rel);
      assert.equal(src.includes("iPad"), false);
      assert.equal(src.includes("userAgent"), false);
    }
    const css = readSrc("src/app/globals.css");
    assert.ok(css.includes(DESKTOP_CHROME_MEDIA_QUERY));
  });
});
