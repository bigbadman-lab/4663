/**
 * Social 2A — ephemeral TEXT layer / object structural tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  EPHEMERAL_TEXTS_PAGE_DATA_NAME,
  playhtmlTextElementId,
} from "@/lib/social/ephemeral-text";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Social 2A ephemeral text UI", () => {
  it("anonymous cannot start TEXT; named empty-hit gates create", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("isParticipating"));
    assert.ok(layer.includes("if (!isParticipating || !self) return"));
    assert.ok(layer.includes("registerEmptyCanvasClick"));
    assert.ok(layer.includes("CanvasCreateMenu"));
    assert.ok(layer.includes("[ TEXT ]") || layer.includes("onChooseText"));
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("data-4663-canvas-empty-hit"));
  });

  it("create menu exposes TEXT action without opening composer immediately", () => {
    const menu = readSrc("src/components/social/canvas-create-menu.tsx");
    assert.ok(menu.includes("[ TEXT ]"));
    assert.ok(menu.includes("onChooseText"));
    assert.equal(menu.includes("EphemeralTextComposer"), false);
  });

  it("draft is local composer only — no typing broadcast in composer module", () => {
    const composer = readSrc(
      "src/components/social/ephemeral-text-composer.tsx",
    );
    assert.ok(composer.includes("data-4663-ephemeral-text-composer"));
    assert.equal(composer.includes("dispatchPlayEvent"), false);
    assert.equal(composer.includes("createBrowserSupabase"), false);
    assert.equal(composer.includes(".channel("), false);
    assert.ok(composer.includes("maxLength={EPHEMERAL_TEXT_MAX_LENGTH}"));
    assert.ok(composer.includes("onDraftBodyChange"));
  });

  it("published object has no edit path; plain text body", () => {
    const object = readSrc("src/components/social/ephemeral-text-object.tsx");
    assert.ok(object.includes("data-4663-ephemeral-text-body"));
    assert.ok(object.includes("{text.body}"));
    assert.equal(object.includes("dangerouslySetInnerHTML"), false);
    assert.equal(object.includes("contentEditable"), false);
    assert.equal(object.includes("textarea"), false);
  });

  it("CanMoveElement uses direct DOM host; owner vs remote drag", () => {
    const object = readSrc("src/components/social/ephemeral-text-object.tsx");
    assert.ok(/<CanMoveElement[^>]*>\s*<div\b/.test(object));
    assert.ok(object.includes("cursor-grab"));
    assert.ok(object.includes("pointer-events-none"));
    assert.ok(object.includes("playhtmlTextElementId"));
    assert.equal(
      playhtmlTextElementId("550e8400-e29b-41d4-a716-446655440000"),
      "4663-text-550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("owner delete affordance; remote has no delete control", () => {
    const object = readSrc("src/components/social/ephemeral-text-object.tsx");
    assert.ok(object.includes("data-4663-ephemeral-text-delete"));
    assert.ok(object.includes("isOwner"));
    assert.ok(object.includes("[ × ]"));
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("ownerSessionId !== self.sessionId"));
  });

  it("uses PlayHTML page data for late-join shared state", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("usePageData"));
    assert.ok(layer.includes("EPHEMERAL_TEXTS_PAGE_DATA_NAME"));
    assert.equal(EPHEMERAL_TEXTS_PAGE_DATA_NAME, "4663-ephemeral-texts");
    assert.equal(layer.includes("supabase.from"), false);
    // Broadcast is for live drafts only — published texts stay in page data.
    assert.ok(layer.includes("createSocialBroadcastClient"));
  });

  it("LEAVE cleanup registers session-ended; presence-loss retains present owners", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("registerSessionEndedHandler"));
    assert.ok(layer.includes("removeEphemeralTextsByOwner"));
    assert.ok(layer.includes("retainEphemeralTextsForPresentOwners"));
    assert.ok(layer.includes('status === "connecting"'));
  });

  it("mounts on canvas surface; pills/SUMMON/PONS/patch untouched", () => {
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("EphemeralTextLayer"));
    assert.ok(surface.includes("ParticipantPresenceLayer"));

    const pill = readSrc("src/components/social/participant-pill.tsx");
    assert.ok(pill.includes("playhtmlParticipantElementId"));

    const summon = readSrc("src/lib/canvas/summon.ts");
    assert.ok(summon.includes("SUMMON_LIFETIME_MS"));

    const pkg = readSrc("package.json");
    assert.ok(pkg.includes("patch-package"));
  });
});
