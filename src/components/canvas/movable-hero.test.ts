/**
 * Stage 10B.5 — PlayHTML movable hero structural tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  HERO_SUBTITLE_DEFAULT_STYLE,
  HERO_TITLE_DEFAULT_STYLE,
  PLAYHTML_CANVAS_BOUNDS_ID,
  PLAYHTML_HERO_SUBTITLE_ID,
  PLAYHTML_HERO_TITLE_ID,
} from "@/lib/canvas/hero";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Stage 10B.5 PlayHTML movable hero", () => {
  it("1–2. PlayHTML deps present; one PlayProvider on canvas play tree", () => {
    const pkg = JSON.parse(readSrc("package.json")) as {
      dependencies: Record<string, string>;
    };
    assert.ok(pkg.dependencies.playhtml);
    assert.ok(pkg.dependencies["@playhtml/react"]);

    const playTree = readSrc("src/components/canvas/canvas-play-tree.tsx");
    const providers = playTree.match(/<PlayProvider\b/g) ?? [];
    assert.equal(providers.length, 1);
    assert.ok(playTree.includes('from "@playhtml/react"'));

    const rootSource = readSrc("src/components/canvas/canvas-root.tsx");
    assert.ok(rootSource.includes("canvas-play-tree"));
    assert.ok(rootSource.includes("ssr: false"));
    assert.equal((rootSource.match(/<PlayProvider\b/g) ?? []).length, 0);
  });

  it("3–6. stable ids, independent CanMoveElement, shared canvas bounds", () => {
    const hero = readSrc("src/components/canvas/movable-hero.tsx");
    assert.ok(hero.includes(PLAYHTML_HERO_TITLE_ID));
    assert.ok(hero.includes(PLAYHTML_HERO_SUBTITLE_ID));
    assert.notEqual(PLAYHTML_HERO_TITLE_ID, PLAYHTML_HERO_SUBTITLE_ID);

    const moves = hero.match(/<CanMoveElement\b/g) ?? [];
    assert.equal(moves.length, 2);
    assert.equal(
      (hero.match(new RegExp(`bounds=\{PLAYHTML_CANVAS_BOUNDS_ID\}`, "g")) ?? [])
        .length,
      2,
    );

    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes(`id={PLAYHTML_CANVAS_BOUNDS_ID}`));
    assert.equal(PLAYHTML_CANVAS_BOUNDS_ID, "4663-canvas");
  });

  it("7–8. default H1 centered; subtitle beneath", () => {
    assert.equal(HERO_TITLE_DEFAULT_STYLE.left, "50%");
    assert.equal(HERO_SUBTITLE_DEFAULT_STYLE.left, "50%");
    const titleTop = Number.parseFloat(HERO_TITLE_DEFAULT_STYLE.top);
    const subTop = Number.parseFloat(HERO_SUBTITLE_DEFAULT_STYLE.top);
    assert.ok(subTop > titleTop);

    const hero = readSrc("src/components/canvas/movable-hero.tsx");
    assert.ok(hero.includes("HERO_TITLE_DEFAULT_STYLE"));
    assert.ok(hero.includes("HERO_SUBTITLE_DEFAULT_STYLE"));
    assert.ok(hero.includes("-translate-x-1/2"));
  });

  it("9–10. CanvasChrome drops brand; PresenceStatus remains", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("PresenceStatus"));
    assert.equal(chrome.includes("live intelligence for robinhood chain"), false);
    assert.equal(/>\s*4663\s*</.test(chrome), false);
    assert.equal(chrome.includes("font-medium tracking-tight"), false);
  });

  it("11–12. usePublicEvents still once; live events unchanged helpers", () => {
    const rootSource = readSrc("src/components/canvas/canvas-root.tsx");
    assert.equal((rootSource.match(/usePublicEvents\(\)/g) ?? []).length, 1);
    assert.ok(rootSource.includes("selectVisibleLiveEvents"));
    assert.ok(rootSource.includes("assignSlots"));

    const live = readSrc("src/lib/canvas/visible-events.ts");
    assert.ok(live.includes("LIVE_OBJECT_MAX_AGE_MS"));
    assert.ok(live.includes("10 * 60 * 1000") || live.includes("600_000"));
  });

  it("13. no custom drag implementation", () => {
    const hero = readSrc("src/components/canvas/movable-hero.tsx");
    const playTree = readSrc("src/components/canvas/canvas-play-tree.tsx");
    for (const source of [hero, playTree]) {
      assert.equal(source.includes("onPointerDown"), false);
      assert.equal(source.includes("onMouseDown"), false);
      assert.equal(source.includes("dnd-kit"), false);
      assert.equal(source.includes("react-draggable"), false);
    }
    assert.ok(hero.includes("CanMoveElement"));
  });
});
