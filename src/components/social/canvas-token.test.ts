/**
 * TOKEN UI / wiring / interaction structural tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  INTERACTIVE_CANVAS_TARGET_SELECTOR,
  INTERACTIVE_CONTROL_ATTR,
  isInteractiveCanvasTarget,
} from "@/lib/canvas/interactive-control";
import { shouldBeginPlayhtmlMoveForeground } from "@/lib/canvas/playhtml-move-interaction";
import { isCanvasPanHitTarget } from "@/lib/canvas/world-camera";
import { TOKEN_PREVIEW_API_PATH } from "@/lib/social/token-preview";

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

describe("TOKEN creation menu + guest gate", () => {
  it("menu order is TEXT / DRAW / LINK / TOKEN", () => {
    const menu = readSrc("src/components/social/canvas-create-menu.tsx");
    const text = menu.indexOf("[ TEXT ]");
    const draw = menu.indexOf("[ DRAW ]");
    const link = menu.indexOf("[ LINK ]");
    const token = menu.indexOf("[ TOKEN ]");
    const cancel = menu.indexOf("[ CANCEL ]");
    assert.ok(text >= 0 && draw > text && link > draw && token > link && cancel > token);
    assert.ok(menu.includes("data-4663-canvas-create-token"));
    assert.ok(menu.includes("onChooseToken"));
  });

  it("guest TOKEN invokes ENTER helper; named opens composer", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("beginTokenIfNamed"));
    assert.ok(layer.includes('mode: "token"'));
    assert.ok(layer.includes("CanvasTokenComposer"));
    const actions = readSrc("src/lib/social/canvas-token-actions.ts");
    assert.ok(actions.includes("requestParticipationEnter"));
    assert.equal(actions.includes("ParticipationEnterForm"), false);
  });
});

describe("TOKEN persistence / render", () => {
  it("normalized snapshot is written to PlayHTML page data", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("CANVAS_TOKENS_PAGE_DATA_NAME"));
    assert.ok(layer.includes("commitCanvasTokenPublish"));
    assert.ok(layer.includes("createCanvasTokenObject"));
    assert.ok(layer.includes("writeTokensPageData"));
    assert.ok(layer.includes("removeCanvasTokensByOwner"));
    assert.ok(layer.includes("retainCanvasTokensForPresentOwners"));
  });

  it("rendered object does not re-fetch metadata or import chain helpers", () => {
    const object = readSrc("src/components/social/canvas-token-object.tsx");
    const card = readSrc("src/components/social/canvas-token-card.tsx");
    assert.equal(object.includes("requestTokenPreview"), false);
    assert.equal(object.includes(TOKEN_PREVIEW_API_PATH), false);
    assert.equal(object.includes("fetch("), false);
    assert.equal(object.includes("viem"), false);
    assert.equal(object.includes("blockscout"), false);
    assert.equal(card.includes("requestTokenPreview"), false);
    assert.equal(card.includes("fetch("), false);
    assert.equal(card.includes("viem"), false);
    assert.equal(card.includes("blockscout"), false);
    assert.equal(card.includes("dangerouslySetInnerHTML"), false);
    assert.ok(card.includes("href={token.explorerUrl}"));
  });

  it("card shows source, symbol/name fallback, copy, OPEN", () => {
    const card = readSrc("src/components/social/canvas-token-card.tsx");
    assert.ok(card.includes("token.sourceLabel"));
    assert.ok(card.includes("token.symbol"));
    assert.ok(card.includes("token.name"));
    assert.ok(card.includes("formatCanvasTokenAddress"));
    assert.ok(card.includes("copyTextQuiet"));
    assert.ok(card.includes("OPEN ↗"));
    assert.ok(card.includes('rel="noopener noreferrer"'));
    assert.ok(card.includes("token.imageUrl"));
    assert.equal(card.includes("PONS"), false);
    assert.equal(card.includes("POOLS"), false);
    assert.equal(card.includes("newBuyers"), false);
  });

  it("composer previews before PLACE and uses the server endpoint", () => {
    const composer = readSrc("src/components/social/canvas-token-composer.tsx");
    assert.ok(composer.includes("[ PREVIEW ]"));
    assert.ok(composer.includes("[ PLACE ]"));
    assert.ok(composer.includes("[ CANCEL ]"));
    assert.ok(composer.includes("requestTokenPreview"));
    assert.ok(composer.includes("Paste token address"));
    assert.ok(composer.includes("MOBILE_SAFE_COMPOSER_INPUT_CLASS"));
    assert.ok(composer.includes("worldScaleCounterScale"));
    assert.ok(composer.includes("data-4663-snapshot-exclude"));
    const client = readSrc("src/lib/social/token-preview-client.ts");
    assert.ok(client.includes("TOKEN_PREVIEW_API_PATH"));
    assert.ok(client.includes('method: "POST"'));
  });

  it("owner delete and movable host follow LINK", () => {
    const object = readSrc("src/components/social/canvas-token-object.tsx");
    assert.ok(object.includes("CanMoveElement"));
    assert.ok(object.includes("usePlayhtmlMoveForeground"));
    assert.ok(object.includes("PlayhtmlMoveHitFill"));
    assert.ok(object.includes("useInteractiveControlProtection"));
    assert.ok(object.includes("data-4663-canvas-token-delete"));
    assert.ok(object.includes("z-[16]"));
    assert.ok(object.includes("touch-manipulation"));
  });
});

describe("TOKEN interaction", () => {
  it("OPEN and copy are excluded from canvas pan / PlayHTML drag", () => {
    const open = mockClosest("a", { [INTERACTIVE_CONTROL_ATTR]: true });
    assert.equal(isInteractiveCanvasTarget(open as unknown as EventTarget), true);
    assert.equal(isCanvasPanHitTarget(open as unknown as EventTarget), false);
    const copy = mockClosest("button");
    assert.equal(
      shouldBeginPlayhtmlMoveForeground(copy as unknown as EventTarget),
      false,
    );
  });
});
