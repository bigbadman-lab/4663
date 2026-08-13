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
  isCanvasTone,
  normalizeCanvasTone,
  readCanvasTone,
  writeCanvasTone,
} from "@/lib/canvas/canvas-tone";

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

    const drawing = readSrc("src/lib/social/ephemeral-drawing.ts");
    assert.ok(drawing.includes('"#171717"'));
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
    assert.ok(chrome.includes("pointer-events-auto absolute top-5 right-5"));

    assert.ok(
      readSrc("src/components/canvas/canvas-control-palette.tsx").includes(
        "CONTROL_DOCK_ITEMS",
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
