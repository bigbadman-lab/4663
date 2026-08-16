/**
 * Viewport container measurement — ignore 0×0, prefer laid-out box.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  nextViewportCameraAction,
  readViewportClientSize,
} from "@/lib/canvas/viewport-client-size";
import {
  HOME_REGION_LEFT_PX,
  HOME_REGION_TOP_PX,
  homeCameraForViewport,
  initialHomeCameraForViewport,
} from "@/lib/canvas/world-camera";

describe("readViewportClientSize", () => {
  it("returns null for missing or 0×0 boxes", () => {
    assert.equal(readViewportClientSize(null), null);
    assert.equal(
      readViewportClientSize({ clientWidth: 0, clientHeight: 0 }),
      null,
    );
    assert.equal(
      readViewportClientSize({ clientWidth: 768, clientHeight: 0 }),
      null,
    );
  });

  it("prefers clientWidth/Height when positive", () => {
    assert.deepEqual(
      readViewportClientSize({
        clientWidth: 768,
        clientHeight: 1024,
        getBoundingClientRect: () => ({ width: 1, height: 1 }),
      }),
      { width: 768, height: 1024 },
    );
  });

  it("falls back to getBoundingClientRect when client box is 0", () => {
    assert.deepEqual(
      readViewportClientSize({
        clientWidth: 0,
        clientHeight: 0,
        getBoundingClientRect: () => ({ width: 1024, height: 768 }),
      }),
      { width: 1024, height: 768 },
    );
  });
});

describe("nextViewportCameraAction", () => {
  it("waits on 0×0; first valid size HOMEs; later sizes clamp", () => {
    assert.equal(nextViewportCameraAction(false, null), "wait");
    assert.equal(
      nextViewportCameraAction(false, { width: 768, height: 1024 }),
      "initial-home",
    );
    assert.equal(
      nextViewportCameraAction(true, { width: 1024, height: 768 }),
      "clamp",
    );
  });

  it("iPad-class first valid sizes stay scale 1 and inside world/home crop", () => {
    for (const [vw, vh] of [
      [390, 844],
      [768, 1024],
      [1024, 768],
      [1180, 820],
      [1280, 800],
      [1440, 900],
    ] as const) {
      const boot = initialHomeCameraForViewport(vw, vh);
      const home = homeCameraForViewport(vw, vh);
      assert.equal(boot.scale, 1, `${vw}x${vh}`);
      assert.equal(home.scale, 1, `${vw}x${vh}`);
      assert.ok(boot.x >= 0);
      assert.ok(boot.y >= 0);
    }
    const desktop = homeCameraForViewport(1440, 900);
    assert.equal(desktop.x, HOME_REGION_LEFT_PX);
    assert.equal(desktop.y, HOME_REGION_TOP_PX);
  });
});
