/**
 * Hero H1 stacking: visually above world LINK/objects without a broad hit overlay.
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

describe("hero H1 stacking context", () => {
  it("root isolation + chrome promotion keep H1 above world objects", () => {
    const css = readSrc("src/app/globals.css");
    assert.ok(css.includes("isolation: isolate"));
    assert.ok(css.includes("[data-4663-hero-title-paint]"));
    assert.ok(css.includes("translateZ(0)"));

    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.ok(brand.includes("data-4663-hero-title-paint"));
    assert.ok(brand.includes("pointer-events-none absolute inset-0"));
    assert.ok(brand.includes("relative mx-auto w-fit"));
    assert.ok(brand.includes("HERO_SELECT_BUTTON"));
    assert.equal(brand.includes("${HERO_SELECT_BUTTON} w-full"), false);

    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("z-20"));
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("z-10"));

    const link = readSrc("src/components/social/canvas-link-object.tsx");
    assert.ok(link.includes("z-[16]"));
  });

  it("H1 hit target stays w-fit; stack does not become a full-screen overlay", () => {
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    const stack = brand.slice(
      brand.indexOf("data-4663-brand-hero-stack"),
      brand.indexOf("data-4663-hero-subtitle"),
    );
    assert.ok(stack.includes("pointer-events-none"));
    assert.ok(stack.includes("w-fit"));
    assert.equal(stack.includes("pointer-events-auto absolute inset-0"), false);
  });
});
