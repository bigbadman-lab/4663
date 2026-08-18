/**
 * Social 8A.2 — canvas tone model + storage + chrome wiring tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CANVAS_TONE_BOOT_SCRIPT,
  CANVAS_TONE_COLORS,
  CANVAS_TONE_LABELS,
  CANVAS_TONE_STORAGE_KEY,
  CANVAS_TONES,
  DEFAULT_CANVAS_TONE,
  canvasToneTitle,
  isCanvasTone,
  normalizeCanvasTone,
  readCanvasTone,
  writeCanvasTone,
} from "@/lib/canvas/canvas-tone";
import {
  DESKTOP_CHROME_MEDIA_QUERY,
  isCompactCanvasChrome,
  isDesktopCanvasChrome,
} from "@/lib/canvas/canvas-chrome-layout";
import { shouldTrackCanvasPan } from "@/lib/canvas/canvas-pan-gesture";
import {
  INTERACTIVE_CANVAS_TARGET_SELECTOR,
  isInteractiveCanvasTarget,
} from "@/lib/canvas/interactive-control";
import { isCanvasPanHitTarget } from "@/lib/canvas/world-camera";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe("Social 8A.2 canvas tone model", () => {
  it("four light tones exist exactly; default WHITE; no GRAPHITE", () => {
    assert.deepEqual([...CANVAS_TONES], ["white", "bone", "mist", "slate"]);
    assert.equal(DEFAULT_CANVAS_TONE, "white");
    assert.deepEqual(
      CANVAS_TONES.map((t) => CANVAS_TONE_LABELS[t]),
      ["WHITE", "BONE", "MIST", "SLATE"],
    );
    assert.equal(CANVAS_TONE_COLORS.white.bg, "#FFFFFF");
    assert.equal(CANVAS_TONE_COLORS.bone.bg, "#F3F0E7");
    assert.equal(CANVAS_TONE_COLORS.mist.bg, "#E8E8E4");
    assert.equal(CANVAS_TONE_COLORS.slate.bg, "#D3D5D2");
    assert.equal(CANVAS_TONE_COLORS.white.border, "#D4D4D4");
    assert.equal(CANVAS_TONE_COLORS.bone.border, "#D4CFC2");
    assert.equal(isCanvasTone("graphite"), false);
  });

  it("namespaced localStorage key; valid restore; invalid/graphite → WHITE; persists", () => {
    assert.equal(CANVAS_TONE_STORAGE_KEY, "4663_canvas_tone");
    assert.equal(isCanvasTone("slate"), true);
    assert.equal(isCanvasTone("navy"), false);
    assert.equal(normalizeCanvasTone("mist"), "mist");
    assert.equal(normalizeCanvasTone("nope"), "white");
    assert.equal(normalizeCanvasTone("graphite"), "white");

    const storage = memoryStorage();
    assert.equal(readCanvasTone(storage), "white");
    writeCanvasTone("slate", storage);
    assert.equal(readCanvasTone(storage), "slate");
    writeCanvasTone("bone", storage);
    assert.equal(storage.getItem(CANVAS_TONE_STORAGE_KEY), "bone");

    const bad = memoryStorage({ [CANVAS_TONE_STORAGE_KEY]: "sunset" });
    assert.equal(readCanvasTone(bad), "white");

    const obsolete = memoryStorage({ [CANVAS_TONE_STORAGE_KEY]: "graphite" });
    assert.equal(readCanvasTone(obsolete), "white");
  });

  it("all tones including SLATE use dark foreground (no dark-mode invert)", () => {
    for (const tone of CANVAS_TONES) {
      assert.equal(CANVAS_TONE_COLORS[tone].fg, "#171717");
    }
    const css = readSrc("src/app/globals.css");
    assert.ok(css.includes('html[data-canvas-tone="slate"]'));
    assert.ok(css.includes("--canvas-bg: #d3d5d2"));
    assert.equal(css.includes("graphite"), false);
    assert.equal(css.includes("#242424"), false);
    assert.equal(css.includes("#f5f5f5"), false);
  });
});

describe("Social 8A.2 canvas tone UI + invariants", () => {
  it("CANVAS control above WHAT IS THIS; menu exposes four options + selection", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("CanvasToneControl"));
    assert.ok(chrome.includes("CanvasIntroTrigger"));
    assert.ok(chrome.includes("data-4663-chrome-top-right"));
    const block = chrome.slice(
      chrome.indexOf("data-4663-chrome-top-right"),
      chrome.indexOf("data-4663-chrome-presence"),
    );
    assert.ok(
      block.indexOf("CanvasToneControl") < block.indexOf("CanvasIntroTrigger"),
    );
    assert.ok(block.includes("CanvasGuideTrigger"));
    assert.ok(
      block.indexOf("CanvasIntroTrigger") < block.indexOf("CanvasGuideTrigger"),
    );

    const control = readSrc("src/components/canvas/canvas-tone-control.tsx");
    assert.ok(control.includes("[ CANVAS ]"));
    assert.ok(control.includes("CANVAS_TONES.map"));
    assert.ok(control.includes("aria-expanded"));
    assert.ok(control.includes('aria-label="Canvas tone"'));
    assert.ok(control.includes("Escape"));
    assert.ok(control.includes("menuitemradio"));
    assert.ok(control.includes("[ ${label} ]"));
    for (const tone of CANVAS_TONES) {
      assert.ok(control.includes("data-4663-canvas-tone-option"));
      assert.ok(CANVAS_TONE_LABELS[tone].length > 0);
    }
  });

  it("presentation only — no Supabase / PlayHTML / page-data / participant or DRAW colour mutation", () => {
    const model = readSrc("src/lib/canvas/canvas-tone.ts");
    const hook = readSrc("src/lib/canvas/use-canvas-tone.ts");
    const control = readSrc("src/components/canvas/canvas-tone-control.tsx");
    for (const src of [model, hook, control]) {
      assert.equal(src.includes("supabase"), false);
      assert.equal(src.includes("PlayHTML"), false);
      assert.equal(src.includes("page data"), false);
      assert.equal(src.includes("getPageData"), false);
      assert.equal(src.includes("sessionStorage"), false);
    }
    assert.equal(isCanvasTone("graphite"), false);
    assert.equal(CANVAS_TONE_BOOT_SCRIPT.includes("graphite"), false);
    assert.ok(model.includes("localStorage") || model.includes("Storage"));
    assert.ok(hook.includes("localStorage") || hook.includes("writeCanvasTone"));
    assert.ok(hook.includes("DEFAULT_CANVAS_TONE"));
    assert.ok(hook.includes("useState<CanvasTone>(DEFAULT_CANVAS_TONE)"));
    assert.ok(hook.includes("readCanvasTone()"));

    const drawColours = readSrc("src/lib/social/draw-colours.ts");
    assert.ok(drawColours.includes('"#171717"'));
    assert.equal(drawColours.includes("canvas-tone"), false);

    const drawing = readSrc("src/lib/social/ephemeral-drawing.ts");
    assert.equal(drawing.includes("canvas-tone"), false);

    const colour = readSrc("src/lib/social/colour.ts");
    assert.equal(colour.includes("canvas-tone"), false);
  });

  it("canvas root uses tone CSS vars; boot script + layout wire", () => {
    const play = readSrc("src/components/canvas/canvas-play-tree.tsx");
    assert.ok(play.includes("--canvas-bg"));
    assert.ok(play.includes("data-4663-canvas-root"));

    const layout = readSrc("src/app/layout.tsx");
    assert.ok(layout.includes("CANVAS_TONE_BOOT_SCRIPT"));
    assert.ok(layout.includes("data-canvas-tone"));
    assert.ok(CANVAS_TONE_BOOT_SCRIPT.includes(CANVAS_TONE_STORAGE_KEY));
    assert.ok(CANVAS_TONE_BOOT_SCRIPT.includes("slate"));
    assert.equal(CANVAS_TONE_BOOT_SCRIPT.includes("graphite"), false);

    const css = readSrc("src/app/globals.css");
    assert.ok(css.includes("--canvas-bg"));
    assert.ok(css.includes("200ms"));
  });

  it("top-right pointer routing + dock/PONS untouched markers", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("pointer-events-none absolute inset-0"));
    assert.ok(chrome.includes("data-4663-chrome-top-right"));
    assert.ok(chrome.includes("pointer-events-none absolute top-[max(1.25rem,env(safe-area-inset-top,0px))]"));

    assert.ok(
      readSrc("src/components/canvas/canvas-control-palette.tsx").includes(
        "getLiveControlDockItems",
      ),
    );
    assert.ok(readSrc("src/lib/pons/continuation.ts").length > 0);
    assert.ok(
      readSrc("src/lib/social/canvas-create-actions.ts").includes(
        "DOCK_CREATE_DEFAULT_ORIGIN",
      ),
    );
  });
});

describe("canvas tone inline palette", () => {
  it("1. desktop chrome renders the inline palette", () => {
    const control = readSrc("src/components/canvas/canvas-tone-control.tsx");
    assert.ok(control.includes("data-4663-canvas-tone-swatches"));
    assert.ok(control.includes("PaperColorSwatch"));
    assert.ok(control.includes("hidden"));
    assert.ok(control.includes("desktop-chrome:flex"));
    assert.equal(control.includes("sm:"), false);
  });

  it("2. palette uses the expected canvas colour values", () => {
    const control = readSrc("src/components/canvas/canvas-tone-control.tsx");
    assert.ok(control.includes("CANVAS_TONES.map"));
    assert.ok(control.includes("CANVAS_TONE_COLORS"));
    assert.ok(control.includes("visual.bg"));
    assert.deepEqual([...CANVAS_TONES], ["white", "bone", "mist", "slate"]);
    assert.equal(canvasToneTitle("white"), "White");
    assert.equal(canvasToneTitle("bone"), "Bone");
  });

  it("3. current canvas colour is visibly marked selected", () => {
    const control = readSrc("src/components/canvas/canvas-tone-control.tsx");
    const swatch = readSrc("src/components/paper-color-swatch.tsx");
    assert.ok(control.includes("selectedBorder={visual.fg}"));
    assert.ok(control.includes('data-4663-canvas-tone-swatch-selected'));
    assert.ok(control.includes("aria-checked={selected}"));
    assert.ok(swatch.includes("selected ? selectedBorder : border"));
  });

  it("4. clicking a swatch changes the canvas tone", () => {
    const control = readSrc("src/components/canvas/canvas-tone-control.tsx");
    assert.ok(control.includes("onClick={() => setTone(option)}"));
    assert.ok(control.includes("Set canvas colour to"));
  });

  it("5. existing full colour/tone control still works", () => {
    const control = readSrc("src/components/canvas/canvas-tone-control.tsx");
    assert.ok(control.includes("[ CANVAS ]"));
    assert.ok(control.includes("data-4663-canvas-tone-trigger"));
    assert.ok(control.includes("data-4663-canvas-tone-menu"));
    assert.ok(control.includes("data-4663-canvas-tone-option"));
    assert.ok(control.includes("menuitemradio"));
    assert.ok(control.includes("setOpen((value) => !value)"));
  });

  it("6. swatch interaction does not initiate canvas pan", () => {
    const control = readSrc("src/components/canvas/canvas-tone-control.tsx");
    assert.ok(control.includes('type="button"'));
    assert.ok(control.includes("PaperColorSwatch"));
    const swatch = {
      closest(selector: string) {
        if (
          selector === INTERACTIVE_CANVAS_TARGET_SELECTOR ||
          selector.includes("button")
        ) {
          return this;
        }
        return null;
      },
    };
    assert.equal(
      isInteractiveCanvasTarget(swatch as unknown as EventTarget),
      true,
    );
    assert.equal(
      isCanvasPanHitTarget(swatch as unknown as EventTarget),
      false,
    );
    assert.equal(
      shouldTrackCanvasPan({
        isPrimary: true,
        button: 0,
        createUiBlocksPan: false,
        overlayInteractive: null,
        target: swatch as unknown as EventTarget,
      }),
      false,
    );
  });

  it("7. wrapper gaps do not create dead/intercepting canvas zones", () => {
    const control = readSrc("src/components/canvas/canvas-tone-control.tsx");
    assert.ok(
      control.includes(
        'className="pointer-events-none relative flex flex-col items-end"',
      ),
    );
    assert.ok(
      control.includes(
        'className="pointer-events-none hidden items-center gap-1 desktop-chrome:flex"',
      ),
    );
    assert.ok(control.includes("pointer-events-auto"));
    const swatch = readSrc("src/components/paper-color-swatch.tsx");
    assert.ok(swatch.includes("pointer-events-auto"));
  });

  it("8. compact iPad/mobile layout remains usable", () => {
    const control = readSrc("src/components/canvas/canvas-tone-control.tsx");
    assert.ok(control.includes("hidden"));
    assert.ok(control.includes("desktop-chrome:flex"));
    assert.ok(control.includes("[ CANVAS ]"));
    assert.equal(control.includes("sm:flex"), false);
    assert.equal(
      isCompactCanvasChrome({
        width: 820,
        hoverHover: false,
        pointerFine: false,
      }),
      true,
    );
    assert.equal(
      isCompactCanvasChrome({
        width: 1180,
        hoverHover: false,
        pointerFine: false,
      }),
      true,
    );
  });

  it("9. desktop capability classification remains unchanged", () => {
    assert.equal(
      DESKTOP_CHROME_MEDIA_QUERY,
      "(min-width: 1280px) and (hover: hover) and (pointer: fine)",
    );
    assert.equal(
      isDesktopCanvasChrome({
        width: 1440,
        hoverHover: true,
        pointerFine: true,
      }),
      true,
    );
    const css = readSrc("src/app/globals.css");
    assert.ok(css.includes(DESKTOP_CHROME_MEDIA_QUERY));
    const control = readSrc("src/components/canvas/canvas-tone-control.tsx");
    assert.equal(control.includes("navigator.userAgent"), false);
  });

  it("10. palette shares existing module palette source/component", () => {
    const control = readSrc("src/components/canvas/canvas-tone-control.tsx");
    const picker = readSrc(
      "src/components/modules/lab-object-color-picker.tsx",
    );
    const swatch = readSrc("src/components/paper-color-swatch.tsx");
    assert.ok(control.includes("PaperColorSwatch"));
    assert.ok(picker.includes("PaperColorSwatch"));
    assert.ok(swatch.includes("h-5 w-5"));
    assert.ok(swatch.includes("rounded-full"));
    assert.ok(swatch.includes("selected ? selectedBorder : border"));
    assert.ok(picker.includes("LAB_OBJECT_COLORS"));
    assert.ok(control.includes("CANVAS_TONE_COLORS"));
    assert.equal(control.includes("LAB_OBJECT_COLOR_IDS"), false);
  });
});
