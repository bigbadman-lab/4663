/**
 * Local hero appearance preferences — colour cycle, hide/show, localStorage only.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_HERO_PREFERENCES,
  HERO_COLORS,
  HERO_COLOR_VALUES,
  HERO_PREFERENCES_STORAGE_KEY,
  heroTextColorStyle,
  nextHeroColor,
  normalizeHeroPreferences,
  readHeroPreferences,
  writeHeroPreferences,
} from "@/lib/canvas/hero-preferences";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    raw: map,
  };
}

describe("hero preferences (local appearance)", () => {
  it("1. hero copy renders by default (visible + default colour)", () => {
    assert.equal(DEFAULT_HERO_PREFERENCES.visible, true);
    assert.equal(DEFAULT_HERO_PREFERENCES.color, "default");

    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.ok(brand.includes("BRAND_HERO_TITLE"));
    assert.ok(brand.includes("BRAND_HERO_SUBTITLE"));
    assert.ok(brand.includes("preferences.visible"));
    assert.ok(brand.includes("return null"));
  });

  it("2. H1 click cycles colour; HIDE sits above the title (no COLOR control)", () => {
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.ok(brand.includes("data-4663-hero-appearance-tools"));
    assert.ok(brand.includes("data-4663-hero-hide"));
    assert.ok(brand.includes("HIDE"));
    assert.equal(brand.includes('data-4663-hero-color"'), false);
    assert.equal(/\bCOLOR\b/.test(brand), false);
    assert.ok(brand.includes("cycleColor()"));
    assert.ok(brand.includes('data-4663-hero-select="title"'));
    assert.ok(brand.includes("top-[calc(42%-3.25rem)]"));
    assert.ok(brand.includes('type="button"'));
    assert.ok(brand.includes("touch-manipulation"));
    assert.ok(brand.includes("min-h-11"));
  });

  it("3. COLOR cycles through the fixed colour set", () => {
    assert.deepEqual([...HERO_COLORS], [
      "default",
      "slate",
      "blue",
      "green",
      "red",
    ]);
    assert.equal(nextHeroColor("default"), "slate");
    assert.equal(nextHeroColor("slate"), "blue");
    assert.equal(nextHeroColor("blue"), "green");
    assert.equal(nextHeroColor("green"), "red");
    assert.equal(nextHeroColor("red"), "default");
    assert.equal(HERO_COLOR_VALUES.slate, "#64748b");
    assert.equal(HERO_COLOR_VALUES.blue, "#1d4ed8");
    assert.equal(HERO_COLOR_VALUES.green, "#15803d");
    assert.equal(HERO_COLOR_VALUES.red, "#b91c1c");
    assert.equal(heroTextColorStyle("default"), undefined);
    assert.deepEqual(heroTextColorStyle("blue"), { color: "#1d4ed8" });
  });

  it("4. HIDE removes hero copy but leaves Enter available", () => {
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.ok(brand.includes("hideHero"));
    assert.ok(brand.includes("if (!preferences.visible)"));

    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("ParticipationEnterTrigger"));
    assert.ok(chrome.includes("data-4663-chrome-participation"));
    assert.ok(chrome.includes("PARTICIPATION_CONTROL_DEFAULT_STYLE"));
    // Enter is a chrome sibling of BrandAnchors — not nested inside BrandHero.
    assert.ok(chrome.includes("<BrandAnchors"));
    assert.ok(chrome.includes("<ParticipationEnterTrigger"));
    assert.equal(brand.includes("ParticipationEnter"), false);
  });

  it("5. SHOW HERO restores the hero from the control palette", () => {
    const palette = readSrc(
      "src/components/canvas/canvas-control-palette.tsx",
    );
    assert.ok(palette.includes("useHeroPreferences"));
    assert.ok(palette.includes("data-4663-show-hero"));
    assert.ok(palette.includes("[ SHOW HERO ]"));
    assert.ok(palette.includes("!heroPreferences.visible"));
    assert.ok(palette.includes("showHero()"));
  });

  it("6. selected colour survives hide/show (prefs keep color)", () => {
    const hiddenBlue = normalizeHeroPreferences({
      color: "blue",
      visible: false,
    });
    assert.equal(hiddenBlue.color, "blue");
    assert.equal(hiddenBlue.visible, false);
    const shown = normalizeHeroPreferences({
      ...hiddenBlue,
      visible: true,
    });
    assert.equal(shown.color, "blue");
    assert.equal(shown.visible, true);
  });

  it("7. preferences persist/reload from localStorage", () => {
    assert.equal(HERO_PREFERENCES_STORAGE_KEY, "4663:hero-preferences");
    const storage = memoryStorage();
    writeHeroPreferences(
      { color: "green", visible: false },
      storage,
    );
    const raw = storage.getItem(HERO_PREFERENCES_STORAGE_KEY);
    assert.ok(raw);
    assert.deepEqual(JSON.parse(raw!), {
      color: "green",
      visible: false,
    });
    assert.deepEqual(readHeroPreferences(storage), {
      color: "green",
      visible: false,
    });
    assert.deepEqual(
      readHeroPreferences(memoryStorage()),
      DEFAULT_HERO_PREFERENCES,
    );
    assert.deepEqual(
      normalizeHeroPreferences({ color: "nope", visible: "yes" }),
      DEFAULT_HERO_PREFERENCES,
    );
  });

  it("8. no PlayHTML / collaborative / Supabase writes from hero prefs", () => {
    const prefs = readSrc("src/lib/canvas/hero-preferences.ts");
    const hook = readSrc("src/lib/canvas/use-hero-preferences.ts");
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    for (const src of [prefs, hook, brand]) {
      assert.equal(src.includes("@playhtml/react"), false);
      assert.equal(src.includes("CanMoveElement"), false);
      assert.equal(src.includes("usePageData"), false);
      assert.equal(src.includes("supabase"), false);
      assert.equal(src.includes("setData"), false);
      assert.equal(src.includes("Presence"), false);
    }
    assert.ok(prefs.includes("localStorage") || prefs.includes("Storage"));
    assert.ok(hook.includes("localStorage"));
  });
});
