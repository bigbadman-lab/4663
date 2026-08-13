/**
 * Stage 10B.10 — PONS visual hierarchy structural tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { playhtmlEventElementId } from "@/lib/canvas/hero";
import {
  PONS_BUYER_COUNT_COLOR,
  PONS_EARLIER_LABEL_COLOR,
  PONS_NEW_WALLETS_COLOR,
} from "@/lib/canvas/pons-visual";
import {
  playhtmlSummonedElementId,
  SUMMON_LIFETIME_MS,
} from "@/lib/canvas/summon";
import { LIVE_OBJECT_MAX_AGE_MS } from "@/lib/canvas/visible-events";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Stage 10B.10 PONS visual hierarchy", () => {
  it("1–5. buyer count / NEW WALLETS / body hierarchy + colors", () => {
    assert.equal(PONS_BUYER_COUNT_COLOR, "#8FAE00");
    assert.equal(PONS_NEW_WALLETS_COLOR, "#3B82F6");

    const copy = readSrc("src/components/canvas/pons-activity-copy.tsx");
    assert.ok(copy.includes("data-4663-pons-buyer-count"));
    assert.ok(copy.includes("data-4663-pons-new-wallets"));
    assert.ok(copy.includes("data-4663-pons-body"));
    assert.ok(copy.includes("PONS_BUYER_COUNT_COLOR"));
    assert.ok(copy.includes("PONS_NEW_WALLETS_COLOR"));
    assert.ok(copy.includes("NEW WALLETS"));
    assert.ok(copy.includes("bought this token"));
    assert.equal(copy.includes("new wallets bought this token"), false);
  });

  it("6–8. address/copy unchanged; EARLIER amber on summoned", () => {
    assert.equal(PONS_EARLIER_LABEL_COLOR, "#F59E0B");

    const live = readSrc(
      "src/components/canvas/pons-buying-activity-object.tsx",
    );
    assert.ok(live.includes("copyTextQuiet(event.tokenAddress)"));
    assert.ok(live.includes("PonsAddressCopyControl"));
    assert.ok(live.includes("PonsActivityCopy"));
    assert.equal(live.includes("earlierLabel"), false);

    const summoned = readSrc(
      "src/components/canvas/summoned-pons-object.tsx",
    );
    assert.ok(summoned.includes("earlierLabel"));
    assert.ok(summoned.includes("copyTextQuiet(event.tokenAddress)"));
    assert.ok(summoned.includes("PonsAddressCopyControl"));

    const address = readSrc(
      "src/components/canvas/pons-address-copy-control.tsx",
    );
    assert.ok(address.includes("data-4663-event-address"));
    assert.ok(address.includes("data-4663-copy-glyph"));
    assert.ok(address.includes("formatShortAddress"));
    assert.ok(address.includes("pointer-events-none"));

    const copy = readSrc("src/components/canvas/pons-activity-copy.tsx");
    assert.ok(copy.includes("EARLIER"));
    assert.ok(copy.includes("PONS_EARLIER_LABEL_COLOR"));
    assert.ok(copy.includes("data-4663-pons-earlier-label"));
  });

  it("9–12. identities and lifetimes unchanged; no event semantics rewrite", () => {
    const eventId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const summonId = "aaaaaaaa-bbbb-cccc-dddd-ffffffffffff";
    assert.equal(playhtmlEventElementId(eventId), `4663-event-${eventId}`);
    assert.equal(
      playhtmlSummonedElementId(summonId, eventId),
      `4663-summoned-${summonId}-${eventId}`,
    );
    assert.equal(LIVE_OBJECT_MAX_AGE_MS, 10 * 60 * 1000);
    assert.equal(SUMMON_LIFETIME_MS, 20_000);

    const live = readSrc(
      "src/components/canvas/pons-buying-activity-object.tsx",
    );
    assert.ok(live.includes("playhtmlEventElementId(event.id)"));
    assert.equal(live.includes("usePublicEvents"), false);
    assert.equal(live.includes("dispatchPlayEvent"), false);

    const summoned = readSrc(
      "src/components/canvas/summoned-pons-object.tsx",
    );
    assert.ok(summoned.includes("playhtmlSummonedElementId(summonId, event.id)"));
    assert.ok(summoned.includes("CanMoveElement"));
  });
});
