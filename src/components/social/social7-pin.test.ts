/**
 * Social 7 — PIN UI / cleanup / coexistence structural tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { LIVE_OBJECT_MAX_AGE_MS } from "@/lib/canvas/visible-events";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Social 7 PIN UI + lifecycle invariants", () => {
  it("LIVE window constant is 10 minutes exclusive", () => {
    assert.equal(LIVE_OBJECT_MAX_AGE_MS, 10 * 60 * 1000);
    const visible = readSrc("src/lib/canvas/visible-events.ts");
    assert.ok(visible.includes("age < maxAgeMs"));
  });

  it("live PONS exposes PIN; summoned does not; MARK/TEXT/DRAW do not", () => {
    const live = readSrc("src/components/canvas/pons-buying-activity-object.tsx");
    assert.ok(live.includes("PonsPinControl"));

    const summoned = readSrc("src/components/canvas/summoned-pons-object.tsx");
    assert.equal(summoned.includes("PonsPinControl"), false);
    assert.equal(summoned.includes("PIN"), false);

    const mark = readSrc("src/components/social/canvas-mark-object.tsx");
    assert.equal(mark.includes("PonsPinControl"), false);

    const text = readSrc("src/components/social/ephemeral-text-object.tsx");
    assert.equal(text.includes("PonsPinControl"), false);
  });

  it("anonymous cannot pin; named control present", () => {
    const control = readSrc("src/components/social/pons-pin-control.tsx");
    assert.ok(control.includes("isParticipating"));
    assert.ok(control.includes("[ PIN ]"));
    assert.ok(control.includes("if (!isParticipating)"));
  });

  it("pinned object is movable with direct DOM host; shows PINNED + WATCH", () => {
    const pinned = readSrc("src/components/canvas/pinned-pons-object.tsx");
    assert.ok(pinned.includes("CanMoveElement"));
    assert.ok(pinned.includes("playhtmlPinnedElementId"));
    assert.ok(pinned.includes("[ PINNED ]"));
    assert.ok(pinned.includes("PonsWatchControl"));
    assert.ok(/<CanMoveElement[^>]*>\s*<div\b/.test(pinned));
  });

  it("RESET/LEAVE/Presence cleanup do not remove PIN", () => {
    const hook = readSrc("src/lib/social/use-canvas-pins.ts");
    assert.equal(hook.includes("registerSessionEndedHandler"), false);
    assert.equal(hook.includes("registerSessionContentResetHandler"), false);
    assert.ok(hook.includes("getBrowserSupabaseClient"));
    assert.ok(hook.includes("pruneExpiredPins"));
  });

  it("API + migration: no generated column; unique event; RLS; realtime; owner DELETE", () => {
    const route = readSrc("src/app/api/social/pins/route.ts");
    assert.ok(route.includes("createCanvasPin"));
    assert.ok(route.includes("loadActiveCanvasPins"));
    assert.ok(route.includes("export async function DELETE"));
    assert.ok(route.includes("deleteCanvasPin"));

    const server = readSrc("src/lib/social/pins-server.ts");
    assert.ok(server.includes("not_live"));
    assert.ok(server.includes("already_pinned"));
    assert.ok(server.includes("isEventLiveForPin"));
    assert.ok(server.includes("pinExpiresAtFromOccurred"));
    assert.ok(server.includes("not_pin_owner"));
    assert.equal(/created_at\s*:/.test(server), false);

    const migration = readSrc(
      "supabase/migrations/20260813030000_social7_canvas_pins.sql",
    );
    assert.ok(migration.includes("CREATE TABLE public.canvas_pins"));
    assert.ok(migration.includes("UNIQUE (chain_id, event_id)"));
    assert.equal(migration.includes("GENERATED ALWAYS"), false);
    assert.ok(migration.includes("expires_at = event_occurred_at + interval '24 hours'"));
    assert.ok(migration.includes("canvas_pins_public_select"));
    assert.ok(migration.includes("supabase_realtime"));
    assert.ok(migration.includes("ENABLE ROW LEVEL SECURITY"));
    assert.ok(migration.includes("GRANT SELECT"));
    assert.equal(migration.includes("FOR DELETE"), false);
    assert.equal(migration.includes("GRANT DELETE"), false);
  });

  it("pinned object exposes owner-only UNPIN control", () => {
    const pinned = readSrc("src/components/canvas/pinned-pons-object.tsx");
    assert.ok(pinned.includes("[ UNPIN ]"));
    assert.ok(pinned.includes("isPinOwner"));
    assert.ok(pinned.includes("data-4663-pons-unpin"));
  });

  it("duplicate suppression + watch pruner includes pinned ids", () => {
    const rootCanvas = readSrc("src/components/canvas/canvas-root.tsx");
    assert.ok(rootCanvas.includes("suppressLiveEventsWhenPinned"));
    assert.ok(rootCanvas.includes("useCanvasPins"));
    assert.ok(rootCanvas.includes("watchEventIds"));

    const markMig = readSrc(
      "supabase/migrations/20260813020000_social6_canvas_marks.sql",
    );
    assert.ok(markMig.includes("canvas_marks"));
  });

  it("TEXT/DRAW/WATCH/SUMMON/MARK/PONS/pipeline markers unchanged", () => {
    assert.ok(
      readSrc("src/lib/social/ephemeral-text.ts").includes(
        "EPHEMERAL_TEXT_MAX_LENGTH",
      ),
    );
    assert.ok(
      readSrc("src/lib/social/ephemeral-drawing.ts").includes(
        "4663-ephemeral-drawings",
      ),
    );
    assert.ok(
      readSrc("src/lib/social/watch.ts").includes(
        "MAX_WATCHED_EVENTS_PER_SESSION",
      ),
    );
    assert.ok(
      readSrc("src/lib/canvas/active-summon.ts").includes("4663-active-summon"),
    );
    assert.ok(readSrc("package.json").includes("patch-package"));
    assert.ok(readSrc("src/lib/pons/continuation.ts").length > 0);
  });
});
