/**
 * Frame-coalesced pan writes: many pointermoves → one transform per frame;
 * pointerup flushes the last sample so the final delta is not lost.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCanvasPanFrameCoalescer } from "@/lib/canvas/canvas-pan-frame";
import {
  homeCameraForViewport,
  panCamera,
} from "@/lib/canvas/world-camera";

describe("canvas pan frame coalescer", () => {
  it("collapses rapid pointermove samples to one apply per animation frame", () => {
    const applied: Array<{ dx: number; dy: number }> = [];
    const queued: { cb: FrameRequestCallback | null } = { cb: null };
    const coalescer = createCanvasPanFrameCoalescer((sample) => {
      applied.push(sample);
    }, {
      requestAnimationFrame(cb) {
        queued.cb = cb;
        return 1;
      },
      cancelAnimationFrame() {
        queued.cb = null;
      },
    });

    coalescer.push({ dx: 2, dy: 0 });
    coalescer.push({ dx: 8, dy: -3 });
    coalescer.push({ dx: 14, dy: -3 });
    assert.equal(applied.length, 0);
    assert.deepEqual(coalescer.pending(), { dx: 14, dy: -3 });

    queued.cb?.(0);
    assert.equal(applied.length, 1);
    assert.deepEqual(applied[0], { dx: 14, dy: -3 });
    assert.equal(coalescer.pending(), null);
  });

  it("flush applies the pointerup sample even if a frame is pending", () => {
    const applied: Array<{ dx: number; dy: number }> = [];
    const queued: { cb: FrameRequestCallback | null } = { cb: null };
    const coalescer = createCanvasPanFrameCoalescer((sample) => {
      applied.push(sample);
    }, {
      requestAnimationFrame(cb) {
        queued.cb = cb;
        return 7;
      },
      cancelAnimationFrame() {
        queued.cb = null;
      },
    });

    coalescer.push({ dx: 10, dy: 2 });
    coalescer.flush({ dx: 16, dy: 4 });
    assert.equal(queued.cb, null);
    assert.deepEqual(applied, [{ dx: 16, dy: 4 }]);
    assert.equal(coalescer.pending(), null);
  });

  it("camera from pan origin + last delta matches pointerup position", () => {
    const origin = homeCameraForViewport(1280, 800);
    const mid = panCamera(origin, 20, 10, 1280, 800);
    const end = panCamera(origin, 41, 10, 1280, 800);
    assert.equal(end.x, origin.x - 41);
    assert.equal(end.y, origin.y - 10);
    assert.notEqual(end.x, mid.x);
  });
});
