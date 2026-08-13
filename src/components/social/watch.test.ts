/**
 * Social 4 — WATCH UI / wiring (structural).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { MAX_WATCHED_EVENTS_PER_SESSION } from "@/lib/social/watch";
import { PARTICIPATION_CHANNEL_NAME } from "@/lib/social/participation-realtime";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Social 4 WATCH UI", () => {
  it("live PONS exposes WATCH; summoned does not", () => {
    const live = readSrc("src/components/canvas/pons-buying-activity-object.tsx");
    assert.ok(live.includes("PonsWatchControl"));
    assert.ok(live.includes("event.id"));

    const summoned = readSrc("src/components/canvas/summoned-pons-object.tsx");
    assert.equal(summoned.includes("PonsWatchControl"), false);
    assert.equal(summoned.includes("WATCH"), false);
    assert.ok(summoned.includes("data-4663-summoned-event"));
  });

  it("WATCH control gates named toggle; anonymous count-only", () => {
    const control = readSrc("src/components/social/pons-watch-control.tsx");
    assert.ok(control.includes("isParticipating"));
    assert.ok(control.includes("[ WATCH ]"));
    assert.ok(control.includes("[ WATCHING ]"));
    assert.ok(control.includes("WATCH {count}"));
    assert.ok(control.includes('data-4663-pons-watch-interactive="false"'));
    assert.ok(control.includes("toggleWatch"));
  });

  it("WATCH keyed by event id; Presence channel + singleton reused", () => {
    assert.equal(PARTICIPATION_CHANNEL_NAME, "4663-participation");
    assert.equal(MAX_WATCHED_EVENTS_PER_SESSION, 8);
    const controller = readSrc("src/lib/social/participation-controller.ts");
    assert.ok(controller.includes("watchedEventIds"));
    assert.ok(controller.includes("retrackPresence"));
    assert.ok(controller.includes("pruneWatchedEvents"));

    const hook = readSrc("src/lib/social/use-participation.tsx");
    assert.ok(hook.includes("getBrowserSupabaseClient"));
    assert.ok(hook.includes("toggleWatch"));

    const rootSrc = readSrc("src/components/canvas/canvas-root.tsx");
    assert.ok(rootSrc.includes("WatchLiveEventPruner"));
  });

  it("no Postgres or PlayHTML page-data WATCH store", () => {
    const watch = readSrc("src/lib/social/watch.ts");
    assert.equal(watch.includes("usePageData"), false);
    assert.equal(watch.includes("4663-watches"), false);
    assert.equal(watch.includes("supabase.from"), false);

    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.equal(layer.includes("watchedEventIds"), false);
  });

  it("TEXT/DRAW/SUMMON/PONS pipeline markers unchanged", () => {
    assert.ok(
      readSrc("src/lib/social/ephemeral-text.ts").includes(
        "4663-ephemeral-texts",
      ),
    );
    assert.ok(
      readSrc("src/lib/social/ephemeral-drawing.ts").includes(
        "4663-ephemeral-drawings",
      ),
    );
    assert.ok(readSrc("src/lib/canvas/summon.ts").includes("SUMMON_LIFETIME_MS"));
    assert.ok(readSrc("package.json").includes("patch-package"));
  });
});
