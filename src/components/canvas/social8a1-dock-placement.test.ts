/**
 * Social 8A.1 — dock default placement cleanup (safe origin ≠ hero center).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { HERO_TITLE_DEFAULT_STYLE } from "@/lib/canvas/hero";
import {
  DOCK_CREATE_DEFAULT_ORIGIN,
  DOCK_CREATE_DEFAULT_PCT,
} from "@/lib/social/canvas-create-actions";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Social 8A.1 dock default placement", () => {
  it("dock safe origin is 68/35, distinct from hero 50/42", () => {
    assert.deepEqual(DOCK_CREATE_DEFAULT_ORIGIN, {
      leftPct: 68,
      topPct: 35,
    });
    assert.equal(DOCK_CREATE_DEFAULT_PCT, DOCK_CREATE_DEFAULT_ORIGIN);
    assert.equal(HERO_TITLE_DEFAULT_STYLE.left, "50%");
    assert.equal(HERO_TITLE_DEFAULT_STYLE.top, "42%");
    assert.notEqual(
      `${DOCK_CREATE_DEFAULT_ORIGIN.leftPct}%`,
      HERO_TITLE_DEFAULT_STYLE.left,
    );
    assert.notEqual(
      `${DOCK_CREATE_DEFAULT_ORIGIN.topPct}%`,
      HERO_TITLE_DEFAULT_STYLE.top,
    );
  });

  it("dock path uses camera/viewport world mapping; empty-canvas uses click world %", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("DOCK_CREATE_DEFAULT_ORIGIN"));
    assert.ok(layer.includes("dockCreateWorldPct"));
    assert.ok(layer.includes("screenPointToWorldPct"));
    assert.ok(layer.includes("openText"));
    assert.ok(layer.includes("openDraw"));
    assert.ok(layer.includes("openMark"));
    assert.ok(layer.includes("onEmptyCanvasClick"));
    assert.ok(layer.includes('mode: "menu"'));
    // Empty-canvas menu still places at click coords, not dock origin.
    assert.ok(
      layer.includes("setCreateUi({ mode: \"menu\", leftPct, topPct })"),
    );
  });

  it("does not invent a separate create architecture", () => {
    const actions = readSrc("src/lib/social/canvas-create-actions.ts");
    assert.ok(actions.includes("registerCanvasCreateActions"));
    assert.ok(actions.includes("DOCK_CREATE_DEFAULT_ORIGIN"));
    assert.equal(actions.includes("source ="), false);
    assert.equal(actions.includes("placementMode"), false);
  });
});
