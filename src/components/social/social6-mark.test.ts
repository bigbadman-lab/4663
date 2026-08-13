/**
 * Social 6 — MARK UI / cleanup / coexistence structural tests.
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

describe("Social 6 MARK UI + durability invariants", () => {
  it("anonymous cannot create; named menu exposes MARK when allowed", () => {
    const menu = readSrc("src/components/social/canvas-create-menu.tsx");
    assert.ok(menu.includes("[ MARK ]"));
    assert.ok(menu.includes("canMark"));
    assert.ok(menu.includes("onChooseMark"));

    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("canMark"));
    assert.ok(layer.includes('mode: "mark"'));
    assert.ok(layer.includes("hasMarkForSession"));
    // empty-hit still requires named participation
    assert.ok(layer.includes("if (!isParticipating || !self) return"));
  });

  it("MARK is non-movable, no edit/delete, no CanMoveElement", () => {
    const obj = readSrc("src/components/social/canvas-mark-object.tsx");
    assert.equal(obj.includes("CanMoveElement"), false);
    assert.equal(obj.includes("onDelete"), false);
    assert.equal(obj.includes("contentEditable"), false);
    assert.equal(obj.includes("dangerouslySetInnerHTML"), false);
    assert.ok(obj.includes("MARKED:"));
    assert.ok(obj.includes("pointer-events-none"));
  });

  it("composer has no live typing; publish is durable API", () => {
    const composer = readSrc("src/components/social/mark-composer.tsx");
    assert.equal(composer.includes("onDraftBodyChange"), false);
    assert.equal(composer.includes("sendDraft"), false);
    assert.ok(composer.includes("[ MARK ]"));

    const fetchMarks = readSrc("src/lib/social/fetch-marks.ts");
    assert.ok(fetchMarks.includes("MARKS_API_PATH"));
    assert.ok(fetchMarks.includes("POST"));
    assert.ok(
      readSrc("src/lib/social/canvas-mark.ts").includes("/api/social/marks"),
    );

    const route = readSrc("src/app/api/social/marks/route.ts");
    assert.ok(route.includes("loadActiveCanvasMarks"));
    assert.ok(route.includes("createCanvasMark"));
    assert.ok(route.includes("createPresenceSupabase"));

    const server = readSrc("src/lib/social/marks-server.ts");
    assert.equal(server.includes("created_at:"), false);
    assert.equal(server.includes("expires_at:"), false);
    assert.ok(server.includes(".gt(\"expires_at\""));
  });

  it("RESET / LEAVE / Presence cleanup do not remove MARK", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.equal(layer.includes("removeCanvasMark"), false);
    assert.equal(layer.includes("clearMarks"), false);
    // MARK hook used, but cleanup handlers only clear ephemeral content
    assert.ok(layer.includes("registerSessionEndedHandler"));
    assert.ok(layer.includes("registerSessionContentResetHandler"));
    assert.ok(layer.includes("clearOwned"));
    const clearOwnedBlock = layer.slice(
      layer.indexOf("const clearOwned"),
      layer.indexOf("const unsubLeave"),
    );
    assert.equal(clearOwnedBlock.includes("mark"), false);
    assert.equal(clearOwnedBlock.includes("Mark"), false);

    const hook = readSrc("src/lib/social/use-canvas-marks.ts");
    assert.equal(hook.includes("registerSessionEndedHandler"), false);
    assert.equal(hook.includes("registerSessionContentResetHandler"), false);
    assert.equal(hook.includes("retain"), false);
  });

  it("realtime + singleton + migration constraints", () => {
    const realtime = readSrc("src/lib/social/marks-realtime.ts");
    assert.ok(realtime.includes("canvas_marks"));
    assert.ok(realtime.includes("postgres_changes"));
    assert.ok(realtime.includes("getBrowserSupabaseClient") === false);
    assert.ok(realtime.includes("removeChannel"));

    const hook = readSrc("src/lib/social/use-canvas-marks.ts");
    assert.ok(hook.includes("getBrowserSupabaseClient"));
    assert.ok(hook.includes("pruneExpiredMarks"));

    const migration = readSrc(
      "supabase/migrations/20260813020000_social6_canvas_marks.sql",
    );
    assert.ok(migration.includes("created_at timestamptz NOT NULL DEFAULT now()"));
    assert.ok(
      migration.includes(
        "expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')",
      ),
    );
    assert.equal(migration.includes("GENERATED ALWAYS"), false);
    assert.ok(migration.includes("UNIQUE (owner_session_id)"));
    assert.ok(migration.includes("canvas_marks_public_select"));
    assert.ok(migration.includes("GRANT SELECT"));
    assert.ok(migration.includes("supabase_realtime"));
    assert.ok(migration.includes("ENABLE ROW LEVEL SECURITY"));
  });

  it("TEXT / DRAW / WATCH / SUMMON / PONS / PlayHTML patch unchanged markers", () => {
    const text = readSrc("src/lib/social/ephemeral-text.ts");
    assert.ok(text.includes("EPHEMERAL_TEXT_MAX_LENGTH"));
    assert.ok(text.includes("4663-ephemeral-texts"));

    const draw = readSrc("src/lib/social/ephemeral-drawing.ts");
    assert.ok(draw.includes("4663-ephemeral-drawings"));

    const watch = readSrc("src/lib/social/watch.ts");
    assert.ok(watch.includes("MAX_WATCHED_EVENTS_PER_SESSION"));

    const summon = readSrc("src/lib/canvas/active-summon.ts");
    assert.ok(summon.includes("4663-active-summon"));

    const pkg = readSrc("package.json");
    assert.ok(pkg.includes("patch-package"));

    const continuation = readSrc("src/lib/pons/continuation.ts");
    assert.ok(continuation.length > 0);
  });

  it("no update/delete MARK API routes", () => {
    const route = readSrc("src/app/api/social/marks/route.ts");
    assert.equal(route.includes("export async function PUT"), false);
    assert.equal(route.includes("export async function PATCH"), false);
    assert.equal(route.includes("export async function DELETE"), false);
  });
});
