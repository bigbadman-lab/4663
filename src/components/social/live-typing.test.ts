/**
 * Social 2B — live typing wiring (structural).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  EPHEMERAL_TEXTS_PAGE_DATA_NAME,
} from "@/lib/social/ephemeral-text";
import {
  SOCIAL_BROADCAST_CHANNEL_NAME,
  TEXT_DRAFT_THROTTLE_MS,
} from "@/lib/social/text-draft";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Social 2B live typing wiring", () => {
  it("composer exposes draft body callback; publish path unchanged", () => {
    const composer = readSrc(
      "src/components/social/ephemeral-text-composer.tsx",
    );
    assert.ok(composer.includes("onDraftBodyChange"));
    assert.ok(composer.includes("onPublish"));
    assert.equal(composer.includes("CanMoveElement"), false);
    assert.equal(composer.includes("usePageData"), false);
  });

  it("layer uses Broadcast for drafts and page data for published TEXT", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("createSocialBroadcastClient"));
    assert.ok(layer.includes("createThrottledSender"));
    assert.ok(layer.includes("TEXT_DRAFT_THROTTLE_MS"));
    assert.ok(layer.includes("LiveTextDraftView"));
    assert.ok(layer.includes("draftsForRemoteView"));
    assert.ok(layer.includes("createTextDraftId"));
    assert.ok(layer.includes("clearLocalDraftBroadcast"));
    assert.ok(layer.includes("registerSessionEndedHandler"));
    assert.ok(layer.includes("retainTextDraftsForPresentOwners"));
    assert.ok(layer.includes("pruneStaleTextDrafts"));
    assert.ok(layer.includes("usePageData"));
    assert.ok(layer.includes("EPHEMERAL_TEXTS_PAGE_DATA_NAME"));
    assert.equal(EPHEMERAL_TEXTS_PAGE_DATA_NAME, "4663-ephemeral-texts");
    assert.equal(SOCIAL_BROADCAST_CHANNEL_NAME, "4663-social-broadcast");
    assert.equal(TEXT_DRAFT_THROTTLE_MS, 100);
  });

  it("publish clears draft before writing published text", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    const publishIdx = layer.indexOf("const publish = ");
    const slice = layer.slice(publishIdx, publishIdx + 900);
    assert.ok(slice.includes("clearLocalDraftBroadcast"));
    assert.ok(slice.includes("upsertEphemeralText"));
    assert.ok(
      slice.indexOf("clearLocalDraftBroadcast") <
        slice.indexOf("upsertEphemeralText"),
    );
  });

  it("remote draft view is non-movable plain text", () => {
    const view = readSrc("src/components/social/live-text-draft.tsx");
    assert.equal(view.includes("<CanMoveElement"), false);
    assert.equal(view.includes('from "@playhtml/react"'), false);
    assert.ok(view.includes("▌"));
    assert.ok(view.includes("opacity-55") || view.includes("opacity-"));
    assert.ok(view.includes("{draft.body}"));
    assert.equal(view.includes("dangerouslySetInnerHTML"), false);
    assert.ok(view.includes("pointer-events-none"));
  });

  it("does not put drafts into published page-data texts array", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.equal(layer.includes("texts: [..."), false);
    assert.ok(layer.includes("sendDraftUpdated") || layer.includes("push(draft)"));
    const helpers = readSrc("src/lib/social/ephemeral-text.ts");
    assert.equal(helpers.includes("draftId"), false);
  });

  it("pills / SUMMON / PlayHTML patch unchanged by 2B", () => {
    const pill = readSrc("src/components/social/participant-pill.tsx");
    assert.ok(pill.includes("playhtmlParticipantElementId"));
    const summon = readSrc("src/lib/canvas/summon.ts");
    assert.ok(summon.includes("SUMMON_LIFETIME_MS"));
    const pkg = readSrc("package.json");
    assert.ok(pkg.includes("patch-package"));
  });
});
