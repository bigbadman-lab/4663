/**
 * Stage IC1 — world dimensions + local camera helpers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CANVAS_PAN_DRAG_THRESHOLD_PX,
  camerasApproximatelyEqual,
  clampCamera,
  dockCreateWorldPct,
  DRAWING_ZONE_WIDTH_WORLD_PCT,
  HOME_REGION_HEIGHT_PX,
  HOME_REGION_LEFT_PX,
  HOME_REGION_TOP_PX,
  HOME_REGION_WIDTH_PX,
  homeCameraForViewport,
  isCanvasPanHitTarget,
  panCamera,
  PLAYHTML_CANVAS_BOUNDS_ID,
  PLAYHTML_WORLD_BOUNDS_ID,
  screenPointToWorldPct,
  WORLD_HEIGHT_PX,
  WORLD_WIDTH_PX,
} from "@/lib/canvas/world-camera";

describe("Stage IC1 world + camera helpers", () => {
  it("1–2. fixed world dimensions; bounds id is world not viewport", () => {
    assert.equal(WORLD_WIDTH_PX, 4800);
    assert.equal(WORLD_HEIGHT_PX, 3200);
    assert.equal(HOME_REGION_WIDTH_PX, 1440);
    assert.equal(HOME_REGION_HEIGHT_PX, 900);
    assert.equal(HOME_REGION_LEFT_PX, 1680);
    assert.equal(HOME_REGION_TOP_PX, 1150);
    assert.equal(PLAYHTML_WORLD_BOUNDS_ID, "4663-world");
    assert.equal(PLAYHTML_CANVAS_BOUNDS_ID, PLAYHTML_WORLD_BOUNDS_ID);
  });

  it("3. camera defaults to HOME for a matching viewport", () => {
    const cam = homeCameraForViewport(1440, 900);
    assert.equal(cam.x, HOME_REGION_LEFT_PX);
    assert.equal(cam.y, HOME_REGION_TOP_PX);
  });

  it("18. camera cannot leave finite world bounds", () => {
    const cam = clampCamera({ x: -500, y: 99999 }, 1440, 900);
    assert.equal(cam.x, 0);
    assert.equal(cam.y, WORLD_HEIGHT_PX - 900);
  });

  it("pan moves camera opposite to drag; threshold constants set", () => {
    const origin = homeCameraForViewport(1440, 900);
    const next = panCamera(origin, 40, -20, 1440, 900);
    assert.equal(next.x, origin.x - 40);
    assert.equal(next.y, origin.y + 20);
    assert.equal(CANVAS_PAN_DRAG_THRESHOLD_PX, 6);
    assert.equal(camerasApproximatelyEqual(origin, origin), true);
  });

  it("pan hit only empty-hit / world-pan-hit", () => {
    assert.equal(isCanvasPanHitTarget(null), false);
  });

  it("IC2 helpers: screen→world and dock mapping exist", () => {
    const cam = homeCameraForViewport(1440, 900);
    const pct = screenPointToWorldPct(
      720,
      450,
      { left: 0, top: 0, width: 1440, height: 900 },
      cam,
    );
    assert.ok(pct.leftPct > 0 && pct.leftPct < 100);
    const dock = dockCreateWorldPct(
      { left: 0, top: 0, width: 1440, height: 900 },
      cam,
    );
    assert.ok(dock.leftPct > 0);
    assert.ok(DRAWING_ZONE_WIDTH_WORLD_PCT < 10);
  });
});
