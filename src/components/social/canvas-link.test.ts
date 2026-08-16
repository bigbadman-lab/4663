/**
 * LINK UI / wiring / interaction structural tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  INTERACTIVE_CANVAS_TARGET_SELECTOR,
  INTERACTIVE_CONTROL_ATTR,
  isInteractiveCanvasTarget,
} from "@/lib/canvas/interactive-control";
import {
  shouldBeginPlayhtmlMoveForeground,
} from "@/lib/canvas/playhtml-move-interaction";
import { isCanvasPanHitTarget } from "@/lib/canvas/world-camera";
import { LINK_PREVIEW_API_PATH } from "@/lib/social/link-preview";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function mockClosest(tag: string, extra: Record<string, unknown> = {}) {
  return {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    closest(selector: string) {
      if (selector === `[${INTERACTIVE_CONTROL_ATTR}]`) {
        return extra[INTERACTIVE_CONTROL_ATTR] ? this : extra.closestControl ?? null;
      }
      if (selector === INTERACTIVE_CANVAS_TARGET_SELECTOR) {
        if (
          extra[INTERACTIVE_CONTROL_ATTR] ||
          ["A", "BUTTON", "INPUT", "TEXTAREA"].includes(tag.toUpperCase())
        ) {
          return extra.closestInteractive ?? this;
        }
        return extra.closestInteractive ?? null;
      }
      if (selector.includes("canvas-empty-hit")) {
        return extra.emptyHit ? this : extra.closestEmpty ?? null;
      }
      return extra.closestInteractive ?? null;
    },
    ...extra,
  };
}

describe("LINK creation menu + guest gate", () => {
  it("menu order is TEXT / DRAW / LINK", () => {
    const menu = readSrc("src/components/social/canvas-create-menu.tsx");
    const text = menu.indexOf("[ TEXT ]");
    const draw = menu.indexOf("[ DRAW ]");
    const link = menu.indexOf("[ LINK ]");
    const cancel = menu.indexOf("[ CANCEL ]");
    assert.ok(text >= 0 && draw > text && link > draw && cancel > link);
    assert.ok(menu.includes("data-4663-canvas-create-link"));
    assert.ok(menu.includes("onChooseLink"));
  });

  it("guest LINK invokes ENTER helper; named opens composer", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("beginLinkIfNamed"));
    assert.ok(layer.includes("isNamedParticipant"));
    assert.ok(layer.includes('mode: "link"'));
    assert.ok(layer.includes("CanvasLinkComposer"));
    const actions = readSrc("src/lib/social/canvas-link-actions.ts");
    assert.ok(actions.includes("requestParticipationEnter"));
    assert.equal(actions.includes("ParticipationEnterForm"), false);
    assert.equal(layer.includes("ParticipationEnterForm"), false);
  });
});

describe("LINK persistence / render", () => {
  it("normalized snapshot is written to PlayHTML page data", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("CANVAS_LINKS_PAGE_DATA_NAME"));
    assert.ok(layer.includes("commitCanvasLinkPublish"));
    assert.ok(layer.includes("createCanvasLinkObject"));
    assert.ok(layer.includes("writeLinksPageData"));
  });

  it("rendered object does not re-fetch metadata", () => {
    const object = readSrc("src/components/social/canvas-link-object.tsx");
    const card = readSrc("src/components/social/canvas-link-card.tsx");
    assert.equal(object.includes("requestLinkPreview"), false);
    assert.equal(object.includes(LINK_PREVIEW_API_PATH), false);
    assert.equal(object.includes("fetch("), false);
    assert.equal(card.includes("requestLinkPreview"), false);
    assert.equal(card.includes("fetch("), false);
    assert.equal(card.includes("dangerouslySetInnerHTML"), false);
  });

  it("FROM THE INTERNET appears; OPEN uses the snapshot URL", () => {
    const card = readSrc("src/components/social/canvas-link-card.tsx");
    assert.ok(card.includes("FROM THE INTERNET ↗"));
    assert.ok(card.includes("OPEN ↗"));
    assert.ok(card.includes("href={preview.url}"));
    assert.ok(card.includes('rel="noopener noreferrer"'));
    assert.ok(card.includes('target="_blank"'));
  });

  it("missing image produces a text-only card", () => {
    const card = readSrc("src/components/social/canvas-link-card.tsx");
    assert.ok(card.includes("preview.imageUrl"));
    assert.ok(card.includes("onError"));
    assert.equal(card.includes("placeholder"), false);
  });

  it("composer previews before PLACE and uses the server endpoint", () => {
    const composer = readSrc("src/components/social/canvas-link-composer.tsx");
    assert.ok(composer.includes("[ PREVIEW ]"));
    assert.ok(composer.includes("[ PLACE ]"));
    assert.ok(composer.includes("requestLinkPreview"));
    assert.ok(composer.includes("Paste a public URL"));
    assert.ok(composer.includes("MOBILE_SAFE_COMPOSER_INPUT_CLASS"));
    assert.ok(composer.includes("worldScaleCounterScale"));
    assert.equal(composer.includes("iframe"), false);
    const client = readSrc("src/lib/social/link-preview-client.ts");
    assert.ok(client.includes("LINK_PREVIEW_API_PATH"));
    assert.ok(client.includes('method: "POST"'));
    const route = readSrc("src/app/api/social/link-preview/route.ts");
    assert.ok(route.includes("fetchLinkPreview"));
  });
});

describe("LINK interaction", () => {
  it("OPEN target is excluded from canvas pan", () => {
    const open = mockClosest("a", { [INTERACTIVE_CONTROL_ATTR]: true });
    assert.equal(
      isInteractiveCanvasTarget(open as unknown as EventTarget),
      true,
    );
    assert.equal(isCanvasPanHitTarget(open as unknown as EventTarget), false);
  });

  it("OPEN target is excluded from PlayHTML drag", () => {
    const open = mockClosest("a");
    assert.equal(
      shouldBeginPlayhtmlMoveForeground(open as unknown as EventTarget),
      false,
    );
  });

  it("nested child inside OPEN remains interactive", () => {
    const open = mockClosest("a");
    const icon = mockClosest("span", { closestInteractive: open });
    assert.equal(
      isInteractiveCanvasTarget(icon as unknown as EventTarget),
      true,
    );
    assert.equal(
      shouldBeginPlayhtmlMoveForeground(icon as unknown as EventTarget),
      false,
    );
  });

  it("object drag still works from non-interactive surface", () => {
    const surface = mockClosest("div");
    assert.equal(
      shouldBeginPlayhtmlMoveForeground(surface as unknown as EventTarget),
      true,
    );
    const object = readSrc("src/components/social/canvas-link-object.tsx");
    assert.ok(object.includes("usePlayhtmlMoveForeground"));
    assert.ok(object.includes("PlayhtmlMoveHitFill"));
    assert.ok(object.includes("CanMoveElement"));
    assert.ok(object.includes("useInteractiveControlProtection"));
  });
});
