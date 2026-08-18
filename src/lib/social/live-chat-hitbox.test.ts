/**
 * Live chat tight hitbox + header-only drag.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isUsableCanvasPointer, shouldTrackCanvasPan } from "@/lib/canvas/canvas-pan-gesture";
import {
  INTERACTIVE_CANVAS_TARGET_SELECTOR,
  isInteractiveCanvasTarget,
} from "@/lib/canvas/interactive-control";
import {
  beginPlayhtmlMoveForeground,
  shouldBeginPlayhtmlMoveForeground,
} from "@/lib/canvas/playhtml-move-interaction";
import { isCanvasPanHitTarget } from "@/lib/canvas/world-camera";
import {
  LIVE_CHAT_DEFAULT_PANEL_SIZE,
  liveChatCenteredHostRect,
  liveChatHostMatchesPanel,
  liveChatOverlapHit,
  liveChatRegionStartsMove,
  pointInLiveChatRect,
  pointJustOutsideLiveChat,
} from "@/lib/social/live-chat-hitbox";
import {
  LIVE_CHAT_DEFAULT_HEIGHT_PX,
  LIVE_CHAT_DEFAULT_WIDTH_PX,
  readLiveChatSize,
} from "@/lib/social/live-chat-size";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const ORIGIN = { originLeft: 1000, originTop: 800 } as const;
const DEFAULT_RECT = liveChatCenteredHostRect({
  ...ORIGIN,
  width: LIVE_CHAT_DEFAULT_WIDTH_PX,
  height: LIVE_CHAT_DEFAULT_HEIGHT_PX,
});

function interactiveTarget() {
  return {
    closest(selector: string) {
      if (
        selector === INTERACTIVE_CANVAS_TARGET_SELECTOR ||
        selector.includes("button") ||
        selector.includes("input")
      ) {
        return this;
      }
      return null;
    },
  };
}

function headerTarget() {
  return {
    closest() {
      return null;
    },
  };
}

describe("live chat tight hitbox + header drag", () => {
  it("1. LIVE CHAT host dimensions equal visible panel dimensions at default size", () => {
    assert.equal(
      liveChatHostMatchesPanel(
        LIVE_CHAT_DEFAULT_PANEL_SIZE,
        {
          width: LIVE_CHAT_DEFAULT_WIDTH_PX,
          height: LIVE_CHAT_DEFAULT_HEIGHT_PX,
        },
      ),
      true,
    );
    const movable = readSrc("src/components/canvas/movable-live-chat.tsx");
    const host = readSrc("src/components/canvas/live-chat-object.tsx");
    assert.ok(host.includes("-translate-x-1/2 -translate-y-1/2"));
    assert.ok(
      host.includes(
        "pointer-events-auto absolute z-[15] -translate-x-1/2 -translate-y-1/2",
      ),
    );
    assert.equal(movable.includes('className="-translate-x-1/2 -translate-y-1/2"'), false);
    assert.equal(
      /<div className="-translate-x-1\/2 -translate-y-1\/2">/.test(host),
      false,
    );
    assert.ok(host.includes("h-[15rem]"));
    assert.ok(host.includes("sm:h-[16rem] sm:w-[23rem]"));
  });

  it("2. clicking just outside left edge does not target chat", () => {
    const point = pointJustOutsideLiveChat(DEFAULT_RECT, "left");
    assert.equal(pointInLiveChatRect(point, DEFAULT_RECT), false);
  });

  it("3. clicking just outside right edge does not target chat", () => {
    const point = pointJustOutsideLiveChat(DEFAULT_RECT, "right");
    assert.equal(pointInLiveChatRect(point, DEFAULT_RECT), false);
  });

  it("4. clicking just outside top edge does not target chat", () => {
    const point = pointJustOutsideLiveChat(DEFAULT_RECT, "top");
    assert.equal(pointInLiveChatRect(point, DEFAULT_RECT), false);
  });

  it("5. clicking just outside bottom edge does not target chat", () => {
    const point = pointJustOutsideLiveChat(DEFAULT_RECT, "bottom");
    assert.equal(pointInLiveChatRect(point, DEFAULT_RECT), false);
  });

  it("6. another movable object beside chat remains independently draggable", () => {
    const other = {
      left: DEFAULT_RECT.left + DEFAULT_RECT.width + 8,
      top: DEFAULT_RECT.top + 12,
      width: 80,
      height: 64,
    };
    const inOther = { x: other.left + 10, y: other.top + 10 };
    assert.equal(
      liveChatOverlapHit({ chat: DEFAULT_RECT, other, point: inOther }),
      "other",
    );
    const oldOversized = {
      left: ORIGIN.originLeft,
      top: ORIGIN.originTop,
      width: LIVE_CHAT_DEFAULT_WIDTH_PX,
      height: LIVE_CHAT_DEFAULT_HEIGHT_PX,
    };
    const ghost = {
      x: oldOversized.left + oldOversized.width - 12,
      y: oldOversized.top + oldOversized.height - 12,
    };
    assert.equal(pointInLiveChatRect(ghost, DEFAULT_RECT), false);
    assert.equal(
      liveChatOverlapHit({
        chat: DEFAULT_RECT,
        other: oldOversized,
        point: ghost,
      }),
      "other",
    );
  });

  it("7. chat header initiates chat drag", () => {
    assert.equal(liveChatRegionStartsMove("header"), true);
    assert.equal(
      shouldBeginPlayhtmlMoveForeground(
        headerTarget() as unknown as EventTarget,
      ),
      true,
    );
    const host = readSrc("src/components/canvas/live-chat-object.tsx");
    const movable = readSrc("src/components/canvas/movable-live-chat.tsx");
    assert.ok(host.includes("data-4663-live-chat-drag"));
    assert.ok(host.includes("data-4663-live-chat-header"));
    assert.ok(host.includes("cursor-grab"));
    assert.ok(host.includes("active:cursor-grabbing"));
    assert.ok(movable.includes("usePlayhtmlMoveForeground"));
    assert.ok(movable.includes("onPointerDown={move.onPointerDown}"));
    const headerBlock = host.slice(
      host.indexOf("data-4663-live-chat-header"),
      host.indexOf("data-4663-live-chat-body"),
    );
    assert.equal(headerBlock.includes("stopPlayhtmlMoveStart"), false);
  });

  it("8. message list does not initiate chat drag", () => {
    assert.equal(liveChatRegionStartsMove("list"), false);
    const host = readSrc("src/components/canvas/live-chat-object.tsx");
    assert.ok(host.includes("data-4663-live-chat-list"));
    assert.ok(host.includes("data-4663-live-chat-body"));
    assert.ok(host.includes("bodyRef"));
    const body = host.slice(
      host.indexOf("data-4663-live-chat-body"),
      host.indexOf("<LiveChatResizeHandle"),
    );
    assert.ok(body.includes("onPointerDown={stopPlayhtmlMoveStart}"));
  });

  it("9. composer/input does not initiate chat drag", () => {
    assert.equal(liveChatRegionStartsMove("composer"), false);
    const host = readSrc("src/components/canvas/live-chat-object.tsx");
    assert.ok(host.includes("data-4663-live-chat-input"));
    const inputBlock = host.slice(
      host.indexOf("data-4663-live-chat-input") - 400,
      host.indexOf("data-4663-live-chat-input") + 400,
    );
    assert.ok(inputBlock.includes("stopPlayhtmlMoveStart"));
  });

  it("10. chat buttons/controls do not initiate chat drag", () => {
    assert.equal(liveChatRegionStartsMove("send"), false);
    assert.equal(liveChatRegionStartsMove("enter"), false);
    const host = readSrc("src/components/canvas/live-chat-object.tsx");
    assert.ok(host.includes("data-4663-live-chat-send"));
    assert.ok(host.includes("data-4663-live-chat-enter-prompt"));
    const send = interactiveTarget();
    assert.equal(
      shouldBeginPlayhtmlMoveForeground(send as unknown as EventTarget),
      false,
    );
    const mockHost = {
      style: { zIndex: "" },
      setAttribute() {},
      setPointerCapture() {},
      hasPointerCapture() {
        return false;
      },
      releasePointerCapture() {},
    };
    assert.equal(
      beginPlayhtmlMoveForeground(mockHost as unknown as HTMLElement, {
        target: send as unknown as EventTarget,
        pointerId: 1,
      }),
      false,
    );
  });

  it("11. resize handle does not initiate chat drag", () => {
    assert.equal(liveChatRegionStartsMove("resize"), false);
    const handle = readSrc(
      "src/components/canvas/live-chat-resize-handle.tsx",
    );
    assert.ok(handle.includes('type="button"'));
    assert.ok(handle.includes("setPointerCapture"));
    assert.ok(handle.includes("capture: true"));
    assert.ok(handle.includes("stopPropagation"));
    const resize = interactiveTarget();
    assert.equal(
      shouldBeginPlayhtmlMoveForeground(resize as unknown as EventTarget),
      false,
    );
  });

  it("12. resize updates visible panel and movable host together", () => {
    const resized = { width: 500, height: 400 };
    assert.equal(liveChatHostMatchesPanel(resized, resized), true);
    const host = readSrc("src/components/canvas/live-chat-object.tsx");
    assert.ok(host.includes("width: `${size.width}px`"));
    assert.ok(host.includes("height: `${size.height}px`"));
    assert.ok(host.includes("-translate-x-1/2 -translate-y-1/2"));
    assert.equal(
      /<div className="-translate-x-1\/2 -translate-y-1\/2">/.test(host),
      false,
    );
    const rect = liveChatCenteredHostRect({
      ...ORIGIN,
      width: resized.width,
      height: resized.height,
    });
    assert.equal(rect.width, 500);
    assert.equal(rect.height, 400);
  });

  it("13. restored session size keeps host bounds correct", () => {
    const storage = {
      getItem() {
        return JSON.stringify({ width: 480, height: 360 });
      },
      setItem() {},
    };
    const restored = readLiveChatSize(storage, { width: 1440, height: 900 });
    assert.equal(liveChatHostMatchesPanel(restored, restored), true);
    const rect = liveChatCenteredHostRect({
      ...ORIGIN,
      width: restored.width,
      height: restored.height,
    });
    assert.equal(rect.width, restored.width);
    assert.equal(rect.height, restored.height);
    const host = readSrc("src/components/canvas/live-chat-object.tsx");
    assert.ok(host.includes("readLiveChatSize"));
    assert.ok(host.includes("sessionStorage"));
  });

  it("14. canvas pan is not triggered by legitimate chat interaction", () => {
    const header = headerTarget();
    const control = interactiveTarget();
    assert.equal(
      shouldTrackCanvasPan({
        isPrimary: true,
        button: 0,
        createUiBlocksPan: false,
        overlayInteractive: null,
        target: control as unknown as EventTarget,
      }),
      false,
    );
    assert.equal(
      isInteractiveCanvasTarget(control as unknown as EventTarget),
      true,
    );
    assert.equal(
      isCanvasPanHitTarget(control as unknown as EventTarget),
      false,
    );
    const host = readSrc("src/components/canvas/live-chat-object.tsx");
    assert.ok(host.includes("stopPlayhtmlMoveStart"));
    assert.equal(liveChatRegionStartsMove("header"), true);
    assert.equal(
      shouldBeginPlayhtmlMoveForeground(header as unknown as EventTarget),
      true,
    );
  });

  it("15. empty canvas immediately outside chat remains interactive", () => {
    assert.equal(liveChatRegionStartsMove("outside"), false);
    for (const edge of ["left", "right", "top", "bottom"] as const) {
      const point = pointJustOutsideLiveChat(DEFAULT_RECT, edge);
      assert.equal(
        liveChatOverlapHit({
          chat: DEFAULT_RECT,
          other: { left: 0, top: 0, width: 1, height: 1 },
          point,
        }),
        "empty",
      );
    }
    const empty = {
      closest(sel: string) {
        if (sel.includes("canvas-empty-hit") || sel.includes("world-pan-hit")) {
          return this;
        }
        return null;
      },
    };
    assert.equal(
      shouldTrackCanvasPan({
        isPrimary: true,
        button: 0,
        createUiBlocksPan: false,
        overlayInteractive: null,
        target: empty as unknown as EventTarget,
      }),
      true,
    );
  });

  it("16. Safari-compatible pointer assumptions remain intact", () => {
    assert.equal(isUsableCanvasPointer({}), true);
    assert.equal(isUsableCanvasPointer({ button: -1 }), true);
    assert.equal(isUsableCanvasPointer({ isPrimary: false }), false);
    const handle = readSrc(
      "src/components/canvas/live-chat-resize-handle.tsx",
    );
    assert.ok(handle.includes("isUsableCanvasPointer"));
    const hook = readSrc(
      "src/components/canvas/use-playhtml-move-foreground.ts",
    );
    assert.ok(hook.includes("event.currentTarget"));
    const movable = readSrc("src/components/canvas/movable-live-chat.tsx");
    assert.ok(movable.includes("usePlayhtmlMoveForeground"));
  });
});
