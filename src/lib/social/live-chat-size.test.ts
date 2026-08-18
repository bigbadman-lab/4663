/**
 * Desktop live-chat resize — size helpers, clamps, persistence, pan isolation.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { DESKTOP_CHROME_MEDIA_QUERY } from "@/lib/canvas/canvas-chrome-layout";
import { shouldTrackCanvasPan } from "@/lib/canvas/canvas-pan-gesture";
import {
  INTERACTIVE_CANVAS_TARGET_SELECTOR,
  isInteractiveCanvasTarget,
} from "@/lib/canvas/interactive-control";
import { isCanvasPanHitTarget } from "@/lib/canvas/world-camera";
import {
  LIVE_CHAT_DEFAULT_HEIGHT_PX,
  LIVE_CHAT_DEFAULT_SIZE,
  LIVE_CHAT_DEFAULT_WIDTH_PX,
  LIVE_CHAT_MAX_HEIGHT_PX,
  LIVE_CHAT_MAX_HEIGHT_VH,
  LIVE_CHAT_MAX_WIDTH_PX,
  LIVE_CHAT_MAX_WIDTH_VW,
  LIVE_CHAT_MIN_HEIGHT_PX,
  LIVE_CHAT_MIN_WIDTH_PX,
  LIVE_CHAT_SIZE_STORAGE_KEY,
  applyLiveChatResize,
  beginLiveChatResize,
  clampLiveChatSize,
  finishLiveChatResize,
  liveChatSizeLimits,
  moveLiveChatResize,
  readLiveChatSize,
  writeLiveChatSize,
  type LiveChatViewport,
  type StorageLike,
} from "@/lib/social/live-chat-size";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const DESKTOP: LiveChatViewport = { width: 1440, height: 900 };

function memoryStorage(initial: Record<string, string> = {}): StorageLike & {
  store: Record<string, string>;
} {
  const store = { ...initial };
  return {
    store,
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key)
        ? store[key]!
        : null;
    },
    setItem(key: string, value: string) {
      store[key] = value;
    },
  };
}

function resizeButtonTarget() {
  return {
    closest(selector: string) {
      if (
        selector === INTERACTIVE_CANVAS_TARGET_SELECTOR ||
        selector.includes("button")
      ) {
        return this;
      }
      return null;
    },
  };
}

describe("live chat desktop resize", () => {
  it("1. desktop chat renders resize control", () => {
    const chat = readSrc("src/components/canvas/live-chat-object.tsx");
    const handle = readSrc(
      "src/components/canvas/live-chat-resize-handle.tsx",
    );
    assert.ok(chat.includes("LiveChatResizeHandle"));
    assert.ok(chat.includes("desktopChrome"));
    assert.ok(chat.includes("DESKTOP_CHROME_MEDIA_QUERY"));
    assert.ok(handle.includes("data-4663-live-chat-resize"));
    assert.ok(handle.includes('aria-label="Resize chat"'));
    assert.ok(handle.includes("cursor-se-resize"));
    assert.ok(handle.includes("desktop-chrome:block"));
  });

  it("2. compact/touch layout does not render the desktop resize affordance", () => {
    const chat = readSrc("src/components/canvas/live-chat-object.tsx");
    const handle = readSrc(
      "src/components/canvas/live-chat-resize-handle.tsx",
    );
    assert.ok(chat.includes("DESKTOP_CHROME_MEDIA_QUERY"));
    assert.ok(chat.includes("{desktopChrome ? ("));
    assert.ok(handle.includes("hidden"));
    assert.ok(handle.includes("desktop-chrome:block"));
    assert.equal(handle.includes("sm:"), false);
    assert.equal(chat.includes("navigator.userAgent"), false);
    assert.equal(handle.includes("navigator.userAgent"), false);
  });

  it("3. resize increases width", () => {
    const next = applyLiveChatResize({
      width: LIVE_CHAT_DEFAULT_WIDTH_PX,
      height: LIVE_CHAT_DEFAULT_HEIGHT_PX,
      deltaWidth: 80,
      deltaHeight: 0,
      viewport: DESKTOP,
    });
    assert.equal(next.width, LIVE_CHAT_DEFAULT_WIDTH_PX + 80);
    assert.equal(next.height, LIVE_CHAT_DEFAULT_HEIGHT_PX);
  });

  it("4. resize increases height", () => {
    const next = applyLiveChatResize({
      width: LIVE_CHAT_DEFAULT_WIDTH_PX,
      height: LIVE_CHAT_DEFAULT_HEIGHT_PX,
      deltaWidth: 0,
      deltaHeight: 64,
      viewport: DESKTOP,
    });
    assert.equal(next.width, LIVE_CHAT_DEFAULT_WIDTH_PX);
    assert.equal(next.height, LIVE_CHAT_DEFAULT_HEIGHT_PX + 64);
  });

  it("5. resize decreases dimensions", () => {
    const next = applyLiveChatResize({
      width: LIVE_CHAT_DEFAULT_WIDTH_PX + 120,
      height: LIVE_CHAT_DEFAULT_HEIGHT_PX + 80,
      deltaWidth: -40,
      deltaHeight: -24,
      viewport: DESKTOP,
    });
    assert.equal(next.width, LIVE_CHAT_DEFAULT_WIDTH_PX + 80);
    assert.equal(next.height, LIVE_CHAT_DEFAULT_HEIGHT_PX + 56);
  });

  it("6. minimum width clamp", () => {
    const next = applyLiveChatResize({
      width: LIVE_CHAT_DEFAULT_WIDTH_PX,
      height: LIVE_CHAT_DEFAULT_HEIGHT_PX,
      deltaWidth: -400,
      deltaHeight: 0,
      viewport: DESKTOP,
    });
    assert.equal(next.width, LIVE_CHAT_MIN_WIDTH_PX);
    assert.ok(next.width < LIVE_CHAT_DEFAULT_WIDTH_PX);
  });

  it("7. minimum height clamp", () => {
    const next = applyLiveChatResize({
      width: LIVE_CHAT_DEFAULT_WIDTH_PX,
      height: LIVE_CHAT_DEFAULT_HEIGHT_PX,
      deltaWidth: 0,
      deltaHeight: -400,
      viewport: DESKTOP,
    });
    assert.equal(next.height, LIVE_CHAT_MIN_HEIGHT_PX);
    assert.ok(next.height < LIVE_CHAT_DEFAULT_HEIGHT_PX);
  });

  it("8. maximum width clamp", () => {
    const limits = liveChatSizeLimits(DESKTOP);
    assert.equal(
      limits.maxWidth,
      Math.min(LIVE_CHAT_MAX_WIDTH_PX, DESKTOP.width * LIVE_CHAT_MAX_WIDTH_VW),
    );
    const next = applyLiveChatResize({
      width: LIVE_CHAT_DEFAULT_WIDTH_PX,
      height: LIVE_CHAT_DEFAULT_HEIGHT_PX,
      deltaWidth: 4000,
      deltaHeight: 0,
      viewport: DESKTOP,
    });
    assert.equal(next.width, limits.maxWidth);
    assert.ok(next.width < DESKTOP.width * 0.7);
  });

  it("9. maximum height clamp", () => {
    const limits = liveChatSizeLimits(DESKTOP);
    assert.equal(
      limits.maxHeight,
      Math.min(
        LIVE_CHAT_MAX_HEIGHT_PX,
        DESKTOP.height * LIVE_CHAT_MAX_HEIGHT_VH,
      ),
    );
    const next = applyLiveChatResize({
      width: LIVE_CHAT_DEFAULT_WIDTH_PX,
      height: LIVE_CHAT_DEFAULT_HEIGHT_PX,
      deltaWidth: 0,
      deltaHeight: 4000,
      viewport: DESKTOP,
    });
    assert.equal(next.height, limits.maxHeight);
    assert.ok(next.height < DESKTOP.height * 0.75);
  });

  it("10. resize pointerdown is interactive and cannot initiate canvas pan", () => {
    const handle = readSrc(
      "src/components/canvas/live-chat-resize-handle.tsx",
    );
    assert.ok(handle.includes('type="button"'));
    assert.ok(handle.includes("setCreateUiBlocksPan(true)"));
    assert.ok(handle.includes("setPointerCapture"));
    assert.ok(handle.includes('addEventListener("pointerdown"'));
    assert.ok(handle.includes("capture: true"));
    assert.ok(handle.includes("isUsableCanvasPointer"));
    assert.equal(handle.includes("use-interactive-control-protection"), false);

    const target = resizeButtonTarget();
    assert.equal(
      isInteractiveCanvasTarget(target as unknown as EventTarget),
      true,
    );
    assert.equal(
      isCanvasPanHitTarget(target as unknown as EventTarget),
      false,
    );
    assert.equal(
      shouldTrackCanvasPan({
        isPrimary: true,
        button: 0,
        createUiBlocksPan: false,
        overlayInteractive: null,
        target: target as unknown as EventTarget,
      }),
      false,
    );
    assert.equal(
      shouldTrackCanvasPan({
        isPrimary: true,
        button: 0,
        createUiBlocksPan: true,
        overlayInteractive: null,
        target: {
          closest(sel: string) {
            if (sel.includes("canvas-empty-hit")) return this;
            return null;
          },
        } as unknown as EventTarget,
      }),
      false,
    );
  });

  it("11. pointerup preserves the final dimensions", () => {
    const gesture = beginLiveChatResize({
      pointerId: 7,
      clientX: 100,
      clientY: 100,
      size: LIVE_CHAT_DEFAULT_SIZE,
      viewport: DESKTOP,
    });
    const moved = moveLiveChatResize(gesture, {
      pointerId: 7,
      clientX: 180,
      clientY: 140,
      scale: 1,
      viewport: DESKTOP,
    });
    assert.ok(moved);
    const final = finishLiveChatResize(moved!, {
      type: "pointerup",
      pointerId: 7,
      clientX: 200,
      clientY: 160,
      scale: 1,
      viewport: DESKTOP,
    });
    assert.equal(final.width, LIVE_CHAT_DEFAULT_WIDTH_PX + 100);
    assert.equal(final.height, LIVE_CHAT_DEFAULT_HEIGHT_PX + 60);
  });

  it("12. pointercancel exits cleanly", () => {
    const gesture = beginLiveChatResize({
      pointerId: 3,
      clientX: 100,
      clientY: 100,
      size: LIVE_CHAT_DEFAULT_SIZE,
      viewport: DESKTOP,
    });
    const moved = moveLiveChatResize(gesture, {
      pointerId: 3,
      clientX: 140,
      clientY: 130,
      scale: 1,
      viewport: DESKTOP,
    });
    assert.ok(moved);
    const cancelled = finishLiveChatResize(moved!, {
      type: "pointercancel",
      pointerId: 3,
      clientX: 0,
      clientY: 0,
      scale: 1,
      viewport: DESKTOP,
    });
    assert.equal(cancelled.width, LIVE_CHAT_DEFAULT_WIDTH_PX + 40);
    assert.equal(cancelled.height, LIVE_CHAT_DEFAULT_HEIGHT_PX + 30);

    const handle = readSrc(
      "src/components/canvas/live-chat-resize-handle.tsx",
    );
    assert.ok(handle.includes("pointercancel"));
    assert.ok(handle.includes("releasePointerCapture"));
    assert.ok(handle.includes("setCreateUiBlocksPan(false)"));
  });

  it("13. existing chat scrolling still works", () => {
    const chat = readSrc("src/components/canvas/live-chat-object.tsx");
    assert.ok(chat.includes("data-4663-live-chat-list"));
    assert.ok(chat.includes("overflow-y-auto"));
    assert.ok(chat.includes("min-h-0 flex-1"));
    assert.ok(chat.includes("overscroll-contain"));
    assert.ok(chat.includes("stopPlayhtmlMoveStart"));
  });

  it("14. existing chat input/composer still works", () => {
    const chat = readSrc("src/components/canvas/live-chat-object.tsx");
    assert.ok(chat.includes("data-4663-live-chat-composer"));
    assert.ok(chat.includes("data-4663-live-chat-input"));
    assert.ok(chat.includes("data-4663-live-chat-send"));
    assert.ok(chat.includes("useInteractiveControlProtection"));
    assert.ok(chat.includes("ChatComposer"));
    assert.ok(chat.includes("say something..."));
  });

  it("15. session-restored dimensions are validated/clamped", () => {
    const storage = memoryStorage({
      [LIVE_CHAT_SIZE_STORAGE_KEY]: JSON.stringify({
        width: 9999,
        height: 8,
      }),
    });
    const restored = readLiveChatSize(storage, DESKTOP);
    const limits = liveChatSizeLimits(DESKTOP);
    assert.equal(restored.width, limits.maxWidth);
    assert.equal(restored.height, LIVE_CHAT_MIN_HEIGHT_PX);

    const invalid = memoryStorage({
      [LIVE_CHAT_SIZE_STORAGE_KEY]: "not-json",
    });
    assert.deepEqual(readLiveChatSize(invalid, DESKTOP), {
      width: LIVE_CHAT_DEFAULT_WIDTH_PX,
      height: LIVE_CHAT_DEFAULT_HEIGHT_PX,
    });

    writeLiveChatSize(
      { width: 500, height: 400 },
      storage,
      DESKTOP,
    );
    assert.deepEqual(readLiveChatSize(storage, DESKTOP), { width: 500, height: 400 });

    const chat = readSrc("src/components/canvas/live-chat-object.tsx");
    const sizeLib = readSrc("src/lib/social/live-chat-size.ts");
    assert.ok(chat.includes("sessionStorage"));
    assert.equal(sizeLib.includes("localStorage"), false);
    assert.equal(sizeLib.includes("PlayHTML"), false);
    assert.equal(sizeLib.includes("supabase"), false);
  });

  it("short desktop windows keep min usable and never exceed the viewport cap", () => {
    const short = liveChatSizeLimits({ width: 1280, height: 300 });
    assert.equal(short.minHeight, LIVE_CHAT_MIN_HEIGHT_PX);
    assert.equal(short.maxHeight, LIVE_CHAT_MIN_HEIGHT_PX);
    const clamped = clampLiveChatSize(
      { width: 800, height: 512 },
      { width: 1280, height: 300 },
    );
    assert.equal(clamped.height, LIVE_CHAT_MIN_HEIGHT_PX);
  });

  it("pointer delta accounts for camera scale", () => {
    const gesture = beginLiveChatResize({
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      size: LIVE_CHAT_DEFAULT_SIZE,
      viewport: DESKTOP,
    });
    const next = moveLiveChatResize(gesture, {
      pointerId: 1,
      clientX: 80,
      clientY: 40,
      scale: 2,
      viewport: DESKTOP,
    });
    assert.ok(next);
    assert.equal(next!.size.width, LIVE_CHAT_DEFAULT_WIDTH_PX + 40);
    assert.equal(next!.size.height, LIVE_CHAT_DEFAULT_HEIGHT_PX + 20);
  });
});
