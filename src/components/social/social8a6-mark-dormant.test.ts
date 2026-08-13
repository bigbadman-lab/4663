/**
 * Stage 8A.6 — MARK dormant for launch (UI / render / API gated).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONTROL_DOCK_ITEMS,
  getLiveControlDockItems,
} from "@/lib/canvas/control-palette";
import { MARK_ENABLED } from "@/lib/social/canvas-mark";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Stage 8A.6 MARK dormant for launch", () => {
  it("1–3. MARK_ENABLED false; live dock omits MARK with no empty slot", () => {
    assert.equal(MARK_ENABLED, false);
    assert.deepEqual(
      CONTROL_DOCK_ITEMS.map((i) => i.id),
      ["text", "draw", "mark", "home", "summon", "reset"],
    );
    const live = getLiveControlDockItems();
    assert.deepEqual(
      live.map((i) => i.id),
      ["text", "draw", "home", "summon", "reset"],
    );
    assert.equal(live.some((i) => i.id === "mark"), false);
    assert.equal(live.length, 5);

    const palette = readSrc("src/components/canvas/canvas-control-palette.tsx");
    assert.ok(palette.includes("getLiveControlDockItems()"));
    assert.ok(palette.includes("MARK_ENABLED"));
  });

  it("4–6. live render + realtime + POST creation gated", () => {
    const hook = readSrc("src/lib/social/use-canvas-marks.ts");
    assert.ok(hook.includes("if (!MARK_ENABLED)"));
    assert.ok(hook.includes("createMarksRealtimeClient"));
    // subscribeInserts only after early return when disabled.
    const subscribeIdx = hook.indexOf("client.subscribeInserts");
    assert.ok(subscribeIdx > 0);
    const guardBeforeSubscribe = hook.lastIndexOf(
      "if (!MARK_ENABLED) return;",
      subscribeIdx,
    );
    assert.ok(guardBeforeSubscribe > 0);
    assert.ok(guardBeforeSubscribe < subscribeIdx);
    assert.ok(hook.includes("marks: MARK_ENABLED ? marks : []"));
    assert.ok(hook.includes('error: "Mark is unavailable."'));

    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("MARK_ENABLED"));
    assert.ok(
      /\{MARK_ENABLED\s*\?\s*marks\.map/.test(layer),
      "live mark render must be gated by MARK_ENABLED",
    );
    assert.ok(layer.includes("if (!MARK_ENABLED) return"));

    const route = readSrc("src/app/api/social/marks/route.ts");
    assert.ok(route.includes('error: "feature_disabled"'));
    assert.ok(route.includes("status: 403"));
    assert.ok(route.includes("marks: []"));
    assert.equal(route.includes("DROP TABLE"), false);
  });

  it("7–12. TEXT/DRAW/SUMMON/RESET + pins/PONS remain; schema preserved", () => {
    const live = getLiveControlDockItems().map((i) => i.id);
    assert.ok(live.includes("text"));
    assert.ok(live.includes("draw"));
    assert.ok(live.includes("summon"));
    assert.ok(live.includes("reset"));

    const palette = readSrc("src/components/canvas/canvas-control-palette.tsx");
    assert.ok(palette.includes('item.id === "text"'));
    assert.ok(palette.includes('item.id === "draw"'));
    assert.ok(palette.includes('item.id === "summon"'));
    assert.ok(palette.includes('item.id === "reset"'));
    assert.ok(palette.includes("onSummon"));
    assert.ok(palette.includes("onReset"));

    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("PinnedPonsLayer"));
    assert.ok(surface.includes("MovableLiveEventLayer"));
    assert.ok(surface.includes("SummonLayer"));

    const migration = readSrc(
      "supabase/migrations/20260813020000_social6_canvas_marks.sql",
    );
    assert.ok(migration.includes("CREATE TABLE public.canvas_marks"));
    assert.ok(readSrc("src/lib/social/marks-server.ts").includes("createCanvasMark"));
    assert.ok(readSrc("src/lib/social/marks-realtime.ts").includes("canvas_marks"));
  });
});
