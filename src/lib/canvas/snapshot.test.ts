/**
 * SNAPSHOT capture / place / download orchestration.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  captureVisibleCanvasViewport,
  resolveSnapshotPixelRatio,
  SNAPSHOT_MAX_PIXEL_RATIO,
} from "@/lib/canvas/snapshot-capture";
import { downloadSnapshotBlob } from "@/lib/canvas/snapshot-download";
import {
  isSnapshotCaptureIncludedNode,
  SNAPSHOT_CAPTURE_ROOT_SELECTOR,
  SNAPSHOT_EXCLUDE_ATTR,
  SNAPSHOT_EXCLUDE_SELECTOR,
} from "@/lib/canvas/snapshot-exclude";
import { formatSnapshotFilename } from "@/lib/canvas/snapshot-filename";
import {
  attachSnapshotShortcutListener,
  beginSnapshotIfNamed,
  handleSnapshotShortcutKeyDown,
  isSnapshotSaveShortcut,
  isSnapshotTypingTarget,
  registerSnapshotActions,
} from "@/lib/canvas/snapshot-actions";
import {
  homeCameraForViewport,
  WORLD_WIDTH_PX,
} from "@/lib/canvas/world-camera";
import { CHAIN_ID } from "@/lib/pons/constants";
import {
  CANVAS_SNAPSHOTS_PAGE_DATA_NAME,
  commitSnapshotPublish,
  createCanvasSnapshotObject,
  isDurableSnapshotImageUrl,
  isSnapshotPageDataWritable,
  normalizeCanvasSnapshotObject,
  playhtmlSnapshotElementId,
  SNAPSHOT_VIEWPORT_WIDTH_FRAC,
  snapshotPlacementFromViewport,
  upsertCanvasSnapshot,
} from "@/lib/social/canvas-snapshot";
import { snapshotAlreadyPlaced, uploadSnapshotPng } from "@/lib/social/snapshot-upload";
import { storeSnapshotPng } from "@/lib/social/snapshot-upload-server";
import { validateSnapshotPngBytes } from "@/lib/social/snapshot-png";

const OWNER = "550e8400-e29b-41d4-a716-446655440000";
const SNAP_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

function durableUrl(id = SNAP_ID): string {
  return `https://example.supabase.co/storage/v1/object/public/snapshots/${CHAIN_ID}/${id}.png`;
}

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(new ArrayBuffer(24));
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes[16] = (width >>> 24) & 0xff;
  bytes[17] = (width >>> 16) & 0xff;
  bytes[18] = (width >>> 8) & 0xff;
  bytes[19] = width & 0xff;
  bytes[20] = (height >>> 24) & 0xff;
  bytes[21] = (height >>> 16) & 0xff;
  bytes[22] = (height >>> 8) & 0xff;
  bytes[23] = height & 0xff;
  return bytes;
}

function pngBlob(width: number, height: number): Blob {
  const bytes = pngHeader(width, height);
  return new Blob([bytes.buffer as ArrayBuffer], { type: "image/png" });
}

describe("SNAPSHOT capture helpers", () => {
  it("1. capture targets the canvas viewport, not application chrome", () => {
    assert.equal(SNAPSHOT_CAPTURE_ROOT_SELECTOR, "[data-4663-canvas-viewport]");
  });

  it("3. excluded UI is omitted via data-4663-snapshot-exclude", () => {
    assert.equal(SNAPSHOT_EXCLUDE_ATTR, "data-4663-snapshot-exclude");
    assert.equal(SNAPSHOT_EXCLUDE_SELECTOR, "[data-4663-snapshot-exclude]");
    const excluded = {
      nodeType: 1,
      closest(sel: string) {
        return sel === SNAPSHOT_EXCLUDE_SELECTOR ? this : null;
      },
    };
    assert.equal(
      isSnapshotCaptureIncludedNode(excluded as unknown as Element),
      false,
    );
    const included = {
      nodeType: 1,
      closest() {
        return null;
      },
    };
    assert.equal(
      isSnapshotCaptureIncludedNode(included as unknown as Element),
      true,
    );
  });

  it("pixel ratio is capped; empty viewport fails", async () => {
    assert.equal(resolveSnapshotPixelRatio(3), SNAPSHOT_MAX_PIXEL_RATIO);
    assert.equal(resolveSnapshotPixelRatio(undefined), 1);
    const result = await captureVisibleCanvasViewport({
      document: {
        querySelector() {
          return null;
        },
      } as unknown as Document,
    });
    assert.equal(result.ok, false);
  });

  it("injected toBlob returns PNG blob sized from IHDR", async () => {
    const blob = pngBlob(1440, 900);
    const root = {
      clientWidth: 1440,
      clientHeight: 900,
    };
    const result = await captureVisibleCanvasViewport({
      document: {
        querySelector() {
          return root;
        },
        documentElement: { style: { getPropertyValue: () => "#ffffff" } },
        defaultView: { devicePixelRatio: 1, getComputedStyle: () => ({ getPropertyValue: () => "" }) },
      } as unknown as Document,
      toBlob: async () => blob,
      pixelRatio: 1,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.blob.type, "image/png");
    assert.equal(result.width, 1440);
    assert.equal(result.height, 900);
  });
});

describe("SNAPSHOT filename + download", () => {
  it("12. filename is 4663-snapshot-YYYY-MM-DD-HHMMSS.png", () => {
    const name = formatSnapshotFilename(new Date(2026, 7, 15, 16, 5, 9));
    assert.equal(name, "4663-snapshot-2026-08-15-160509.png");
  });

  it("6. DOWNLOAD uses a local blob URL and does not upload", () => {
    const clicks: string[] = [];
    const doc = {
      createElement(tag: string) {
        assert.equal(tag, "a");
        return {
          href: "",
          download: "",
          rel: "",
          click() {
            clicks.push(this.download);
          },
          remove() {},
        };
      },
      body: {
        appendChild() {},
        removeChild() {},
      },
    };
    const blob = pngBlob(1, 1);
    downloadSnapshotBlob(
      blob,
      "4663-snapshot-2026-08-15-160509.png",
      doc as unknown as Document,
    );
    assert.deepEqual(clicks, ["4663-snapshot-2026-08-15-160509.png"]);
  });
});

describe("SNAPSHOT PlayHTML object", () => {
  it("8. object references durable URL, not base64", () => {
    assert.equal(isDurableSnapshotImageUrl(durableUrl()), true);
    assert.equal(isDurableSnapshotImageUrl("data:image/png;base64,aaa"), false);
    assert.equal(isDurableSnapshotImageUrl("blob:https://example/1"), false);
    assert.equal(CANVAS_SNAPSHOTS_PAGE_DATA_NAME, "4663-canvas-snapshots");
  });

  it("9–10. PLACE creates one object preserving aspect ratio", () => {
    const created = createCanvasSnapshotObject({
      ownerSessionId: OWNER,
      imageUrl: durableUrl(),
      leftPct: 50,
      topPct: 50,
      widthPct: 12,
      aspectRatio: 1440 / 900,
      randomUUID: () => SNAP_ID,
      now: () => new Date("2026-08-15T15:00:00.000Z"),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.snapshot.snapshotId, SNAP_ID);
    assert.equal(created.snapshot.imageUrl, durableUrl());
    assert.equal(created.snapshot.aspectRatio, 1440 / 900);
    const published = commitSnapshotPublish({
      previous: { snapshots: [] },
      snapshot: created.snapshot,
      ready: true,
    });
    assert.equal(published.ok, true);
    if (!published.ok) return;
    assert.equal(published.pageData.snapshots.length, 1);
    const again = upsertCanvasSnapshot(published.pageData, created.snapshot);
    assert.equal(again.snapshots.length, 1);
  });

  it("11+16. placed object is viewport centre in world %, including mobile scale", () => {
    const desktop = snapshotPlacementFromViewport({
      viewport: { left: 0, top: 0, width: 1440, height: 900 },
      camera: homeCameraForViewport(1440, 900),
      pixelWidth: 1440,
      pixelHeight: 900,
    });
    assert.ok(desktop);
    assert.equal(SNAPSHOT_VIEWPORT_WIDTH_FRAC, 0.22);
    const cam = homeCameraForViewport(1440, 900);
    assert.ok(
      Math.abs(desktop!.origin.leftPct - ((cam.x + 720) / WORLD_WIDTH_PX) * 100) <
        0.2,
    );
    assert.equal(
      desktop!.widthPct,
      Math.min(40, Math.max(4, ((1440 * SNAPSHOT_VIEWPORT_WIDTH_FRAC) / WORLD_WIDTH_PX) * 100)),
    );
    assert.equal(desktop!.aspectRatio, 1440 / 900);

    const mobile = snapshotPlacementFromViewport({
      viewport: { left: 0, top: 0, width: 390, height: 844 },
      camera: { x: 2000, y: 1000, scale: 0.5 },
      pixelWidth: 390,
      pixelHeight: 844,
    });
    assert.ok(mobile);
    // Visible world width = 390 / 0.5 = 780; centre x = 2000 + 390.
    assert.ok(mobile!.origin.leftPct > 40);
    assert.equal(mobile!.aspectRatio, 390 / 844);
  });

  it("13. not-ready publish keeps prior page data (preview/download still held by caller)", () => {
    const snapshot = normalizeCanvasSnapshotObject({
      snapshotId: SNAP_ID,
      ownerSessionId: OWNER,
      imageUrl: durableUrl(),
      widthPct: 12,
      aspectRatio: 1.6,
      leftPct: 50,
      topPct: 50,
      createdAt: "2026-08-15T15:00:00.000Z",
    });
    assert.ok(snapshot);
    const failed = commitSnapshotPublish({
      previous: { snapshots: [] },
      snapshot: snapshot!,
      ready: false,
    });
    assert.equal(failed.ok, false);
    if (failed.ok) return;
    assert.equal(failed.reason, "not-ready");
    assert.equal(isSnapshotPageDataWritable({ isLoading: true, isProviderMissing: false }), false);
  });

  it("14. duplicate image URL is detected before a second upload/object", () => {
    const first = {
      snapshotId: SNAP_ID,
      ownerSessionId: OWNER,
      imageUrl: durableUrl(),
      widthPct: 12,
      aspectRatio: 1.6,
      leftPct: 50,
      topPct: 50,
      createdAt: "2026-08-15T15:00:00.000Z",
    };
    assert.equal(snapshotAlreadyPlaced([first], durableUrl()), true);
    assert.equal(snapshotAlreadyPlaced([], durableUrl()), false);
  });

  it("15. snapshot objects are capturable (no exclude attr on the image host)", () => {
    assert.equal(playhtmlSnapshotElementId(SNAP_ID), `4663-snapshot-${SNAP_ID}`);
  });
});

describe("SNAPSHOT upload", () => {
  it("7. PLACE uploads exactly one PNG via FormData", async () => {
    let calls = 0;
    const blob = pngBlob(10, 10);
    const result = await uploadSnapshotPng({
      blob,
      sessionId: OWNER,
      chainId: CHAIN_ID,
      fetch: async (url, init) => {
        calls += 1;
        assert.equal(url, "/api/social/snapshots");
        assert.equal(init?.method, "POST");
        assert.ok(init?.body instanceof FormData);
        const file = (init.body as FormData).get("file");
        assert.ok(file instanceof Blob);
        return {
          ok: true,
          json: async () => ({
            ok: true,
            imageUrl: durableUrl(),
            width: 10,
            height: 10,
          }),
        } as Response;
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.imageUrl, durableUrl());
  });

  it("rejects non-PNG / wrong chain / missing session on the server helper", async () => {
    const uploads: string[] = [];
    const supabase = {
      storage: {
        from() {
          return {
            async upload(path: string) {
              uploads.push(path);
              return { error: null };
            },
            getPublicUrl(path: string) {
              return {
                data: {
                  publicUrl: `https://example.supabase.co/storage/v1/object/public/snapshots/${path}`,
                },
              };
            },
          };
        },
      },
    };
    const bad = await storeSnapshotPng(supabase as never, {
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/jpeg",
      chainId: CHAIN_ID,
      sessionId: OWNER,
    });
    assert.equal(bad.ok, false);
    const chain = await storeSnapshotPng(supabase as never, {
      bytes: pngHeader(1, 1),
      mimeType: "image/png",
      chainId: 1,
      sessionId: OWNER,
    });
    assert.equal(chain.ok, false);
    if (!chain.ok) assert.equal(chain.error, "invalid_chain");
    const ok = await storeSnapshotPng(supabase as never, {
      bytes: pngHeader(8, 8),
      mimeType: "image/png",
      chainId: String(CHAIN_ID),
      sessionId: OWNER,
      randomUUID: () => SNAP_ID,
    });
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.equal(ok.objectPath, `${CHAIN_ID}/${SNAP_ID}.png`);
    assert.equal(uploads.length, 1);
    assert.equal(validateSnapshotPngBytes(pngHeader(1, 1)).ok, true);
  });
});

function shortcutEvent(partial: {
  key?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  target?: EventTarget | null;
}): {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
  prevented: boolean;
  preventDefault: () => void;
} {
  const event = {
    key: partial.key ?? "s",
    metaKey: partial.metaKey ?? false,
    ctrlKey: partial.ctrlKey ?? false,
    shiftKey: partial.shiftKey ?? false,
    altKey: partial.altKey ?? false,
    target: partial.target ?? null,
    prevented: false,
    preventDefault() {
      event.prevented = true;
    },
  };
  return event;
}

function typingTarget(tagName: string, extra: Record<string, unknown> = {}) {
  return {
    nodeType: 1,
    tagName,
    ...extra,
  } as unknown as EventTarget;
}

describe("SNAPSHOT keyboard shortcut", () => {
  it("1. Meta+S triggers SNAPSHOT on Mac", () => {
    let captures = 0;
    const event = shortcutEvent({ key: "s", metaKey: true });
    const handled = handleSnapshotShortcutKeyDown(event, {
      isMac: true,
      actions: {
        startCapture: () => {
          captures += 1;
        },
        isBusy: () => false,
      },
    });
    assert.equal(handled, true);
    assert.equal(captures, 1);
    assert.equal(event.prevented, true);
  });

  it("2. Ctrl+S triggers SNAPSHOT elsewhere", () => {
    let captures = 0;
    const event = shortcutEvent({ key: "S", ctrlKey: true });
    const handled = handleSnapshotShortcutKeyDown(event, {
      isMac: false,
      actions: {
        startCapture: () => {
          captures += 1;
        },
        isBusy: () => false,
      },
    });
    assert.equal(handled, true);
    assert.equal(captures, 1);
    assert.equal(event.prevented, true);
  });

  it("3. browser default is prevented when handled", () => {
    const event = shortcutEvent({ key: "s", metaKey: true });
    handleSnapshotShortcutKeyDown(event, {
      isMac: true,
      actions: { startCapture: () => {}, isBusy: () => false },
    });
    assert.equal(event.prevented, true);
  });

  it("4. plain S does nothing", () => {
    let captures = 0;
    const event = shortcutEvent({ key: "s" });
    const handled = handleSnapshotShortcutKeyDown(event, {
      isMac: true,
      actions: {
        startCapture: () => {
          captures += 1;
        },
        isBusy: () => false,
      },
    });
    assert.equal(handled, false);
    assert.equal(captures, 0);
    assert.equal(event.prevented, false);
  });

  it("5. Shift/Alt modified variants do nothing", () => {
    let captures = 0;
    const actions = {
      startCapture: () => {
        captures += 1;
      },
      isBusy: () => false,
    };
    const shiftMeta = shortcutEvent({ key: "s", metaKey: true, shiftKey: true });
    const altMeta = shortcutEvent({ key: "s", metaKey: true, altKey: true });
    const shiftCtrl = shortcutEvent({ key: "s", ctrlKey: true, shiftKey: true });
    const altCtrl = shortcutEvent({ key: "s", ctrlKey: true, altKey: true });
    assert.equal(isSnapshotSaveShortcut(shiftMeta, true), false);
    assert.equal(isSnapshotSaveShortcut(altMeta, true), false);
    assert.equal(isSnapshotSaveShortcut(shiftCtrl, false), false);
    assert.equal(isSnapshotSaveShortcut(altCtrl, false), false);
    assert.equal(
      handleSnapshotShortcutKeyDown(shiftMeta, { isMac: true, actions }),
      false,
    );
    assert.equal(
      handleSnapshotShortcutKeyDown(altCtrl, { isMac: false, actions }),
      false,
    );
    assert.equal(captures, 0);
    assert.equal(shiftMeta.prevented, false);
  });

  it("6. shortcut while typing in input does nothing", () => {
    let captures = 0;
    const event = shortcutEvent({
      key: "s",
      metaKey: true,
      target: typingTarget("INPUT"),
    });
    const handled = handleSnapshotShortcutKeyDown(event, {
      isMac: true,
      actions: {
        startCapture: () => {
          captures += 1;
        },
        isBusy: () => false,
      },
    });
    assert.equal(isSnapshotTypingTarget(event.target), true);
    assert.equal(handled, false);
    assert.equal(captures, 0);
    assert.equal(event.prevented, false);
  });

  it("7. textarea does nothing", () => {
    let captures = 0;
    const event = shortcutEvent({
      key: "s",
      ctrlKey: true,
      target: typingTarget("TEXTAREA"),
    });
    const handled = handleSnapshotShortcutKeyDown(event, {
      isMac: false,
      actions: {
        startCapture: () => {
          captures += 1;
        },
        isBusy: () => false,
      },
    });
    assert.equal(handled, false);
    assert.equal(captures, 0);
    assert.equal(event.prevented, false);
  });

  it("8. contenteditable does nothing", () => {
    let captures = 0;
    const event = shortcutEvent({
      key: "s",
      metaKey: true,
      target: typingTarget("DIV", { isContentEditable: true }),
    });
    const handled = handleSnapshotShortcutKeyDown(event, {
      isMac: true,
      actions: {
        startCapture: () => {
          captures += 1;
        },
        isBusy: () => false,
      },
    });
    assert.equal(handled, false);
    assert.equal(captures, 0);
    assert.equal(event.prevented, false);
  });

  it("9. existing open preview blocks duplicate capture", () => {
    let captures = 0;
    const event = shortcutEvent({ key: "s", metaKey: true });
    const handled = handleSnapshotShortcutKeyDown(event, {
      isMac: true,
      actions: {
        startCapture: () => {
          captures += 1;
        },
        isBusy: () => true,
      },
    });
    assert.equal(handled, true);
    assert.equal(event.prevented, true);
    assert.equal(captures, 0);
  });

  it("10. shortcut uses the same SNAPSHOT action as the UI button", () => {
    let captures = 0;
    const actions = {
      startCapture: () => {
        captures += 1;
      },
      isBusy: () => false,
    };
    const unbind = registerSnapshotActions(actions);
    try {
      handleSnapshotShortcutKeyDown(shortcutEvent({ key: "s", metaKey: true }), {
        isMac: true,
      });
      actions.startCapture();
      assert.equal(captures, 2);
    } finally {
      unbind();
    }
  });

  it("shortcut listener is capture-phase and removed on unbind", () => {
    const ops: string[] = [];
    const target = {
      addEventListener(type: string, _fn: unknown, options: unknown) {
        ops.push(`add:${type}:${String(options === true)}`);
      },
      removeEventListener(type: string, _fn: unknown, options: unknown) {
        ops.push(`remove:${type}:${String(options === true)}`);
      },
    };
    const unbind = attachSnapshotShortcutListener(target as Window);
    unbind();
    assert.deepEqual(ops, ["add:keydown:true", "remove:keydown:true"]);
  });
});

describe("SNAPSHOT named-participant permission", () => {
  it("named participant begins capture", () => {
    let captures = 0;
    let enters = 0;
    const result = beginSnapshotIfNamed({
      isNamedParticipant: true,
      onCapture: () => {
        captures += 1;
      },
      requestEnter: () => {
        enters += 1;
      },
    });
    assert.equal(result, "capture");
    assert.equal(captures, 1);
    assert.equal(enters, 0);
  });

  it("guest does not begin capture and requests ENTER", () => {
    let captures = 0;
    let enters = 0;
    const result = beginSnapshotIfNamed({
      isNamedParticipant: false,
      onCapture: () => {
        captures += 1;
      },
      requestEnter: () => {
        enters += 1;
      },
    });
    assert.equal(result, "enter");
    assert.equal(captures, 0);
    assert.equal(enters, 1);
  });

  it("guest CMD/CTRL+S cannot bypass — same startCapture gate", () => {
    let captures = 0;
    let enters = 0;
    const event = shortcutEvent({ key: "s", metaKey: true });
    const handled = handleSnapshotShortcutKeyDown(event, {
      isMac: true,
      actions: {
        startCapture: () => {
          beginSnapshotIfNamed({
            isNamedParticipant: false,
            onCapture: () => {
              captures += 1;
            },
            requestEnter: () => {
              enters += 1;
            },
          });
        },
        isBusy: () => false,
      },
    });
    assert.equal(handled, true);
    assert.equal(event.prevented, true);
    assert.equal(captures, 0);
    assert.equal(enters, 1);
  });

  it("named participant shortcut still captures", () => {
    let captures = 0;
    let enters = 0;
    const event = shortcutEvent({ key: "s", ctrlKey: true });
    const handled = handleSnapshotShortcutKeyDown(event, {
      isMac: false,
      actions: {
        startCapture: () => {
          beginSnapshotIfNamed({
            isNamedParticipant: true,
            onCapture: () => {
              captures += 1;
            },
            requestEnter: () => {
              enters += 1;
            },
          });
        },
        isBusy: () => false,
      },
    });
    assert.equal(handled, true);
    assert.equal(captures, 1);
    assert.equal(enters, 0);
  });
});

