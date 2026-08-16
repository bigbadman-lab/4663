/**
 * Canvas LINK persistence — snapshot at place time, max 3 per owner.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CANVAS_LINK_MAX_PER_OWNER,
  canPlaceCanvasLink,
  commitCanvasLinkPublish,
  countCanvasLinksForOwner,
  createCanvasLinkObject,
  normalizeCanvasLinkObject,
  playhtmlLinkElementId,
  removeCanvasLink,
  retainCanvasLinksForPresentOwners,
} from "@/lib/social/canvas-link";
import type { LinkPreview } from "@/lib/social/link-preview";

const OWNER_A = "550e8400-e29b-41d4-a716-446655440000";
const OWNER_B = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const LINK_A = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const PREVIEW: LinkPreview = {
  url: "https://example.com/story",
  title: "Story",
  description: "Hello",
  imageUrl: "https://cdn.example.com/og.jpg",
  siteName: "Example",
  domain: "example.com",
};

function placed(id: string, owner = OWNER_A) {
  const created = createCanvasLinkObject({
    preview: PREVIEW,
    ownerSessionId: owner,
    leftPct: 40,
    topPct: 50,
    randomUUID: () => id,
    now: () => new Date("2026-08-16T00:00:00.000Z"),
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("create failed");
  return created.link;
}

describe("Canvas LINK persistence", () => {
  it("persists a normalized metadata snapshot", () => {
    const link = placed(LINK_A);
    assert.equal(link.url, PREVIEW.url);
    assert.equal(link.title, PREVIEW.title);
    assert.equal(link.imageUrl, PREVIEW.imageUrl);
    assert.equal(link.domain, "example.com");
    assert.equal(link.ownerSessionId, OWNER_A);
    assert.equal(playhtmlLinkElementId(link.linkId), `4663-link-${LINK_A}`);
    const roundTrip = normalizeCanvasLinkObject({
      ...link,
      title: "  Story  ",
    });
    assert.equal(roundTrip?.title, "Story");
  });

  it("allows sparse metadata when URL + domain exist", () => {
    const created = createCanvasLinkObject({
      preview: { url: "https://example.com/a", domain: "example.com" },
      ownerSessionId: OWNER_A,
      leftPct: 10,
      topPct: 10,
      randomUUID: () => LINK_A,
      now: () => new Date("2026-08-16T00:00:00.000Z"),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.link.title, undefined);
    assert.equal(created.link.imageUrl, undefined);
  });

  it("participant can place links below the max", () => {
    let data = { links: [] as ReturnType<typeof placed>[] };
    for (let i = 0; i < CANVAS_LINK_MAX_PER_OWNER; i += 1) {
      const id = `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i}`;
      const committed = commitCanvasLinkPublish({
        previous: data,
        link: placed(id),
        ready: true,
      });
      assert.equal(committed.ok, true);
      if (!committed.ok) return;
      data = committed.pageData;
    }
    assert.equal(countCanvasLinksForOwner(data, OWNER_A), 3);
    assert.equal(canPlaceCanvasLink(data, OWNER_A), false);
  });

  it("fourth active link is rejected", () => {
    const links = [0, 1, 2].map((i) =>
      placed(`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i}`),
    );
    const fourth = placed("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    const committed = commitCanvasLinkPublish({
      previous: { links },
      link: fourth,
      ready: true,
    });
    assert.equal(committed.ok, false);
    if (committed.ok) return;
    assert.equal(committed.reason, "limit");
  });

  it("refresh cannot trivially bypass the page-data count", () => {
    const links = [0, 1, 2].map((i) =>
      placed(`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i}`),
    );
    const persisted = { links };
    assert.equal(canPlaceCanvasLink(persisted, OWNER_A), false);
    assert.equal(canPlaceCanvasLink(persisted, OWNER_B), true);
  });

  it("owner delete frees a slot", () => {
    const links = [0, 1, 2].map((i) =>
      placed(`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i}`),
    );
    const next = removeCanvasLink({ links }, links[0].linkId);
    assert.equal(canPlaceCanvasLink(next, OWNER_A), true);
  });

  it("presence retain drops links whose owners left", () => {
    const mine = placed(LINK_A, OWNER_A);
    const theirs = placed("cccccccc-cccc-4ccc-8ccc-cccccccccccc", OWNER_B);
    const next = retainCanvasLinksForPresentOwners(
      { links: [mine, theirs] },
      new Set([OWNER_A]),
    );
    assert.deepEqual(
      next.links.map((link) => link.linkId),
      [LINK_A],
    );
  });
});
