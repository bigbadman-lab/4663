/**
 * Shared Lab object size helpers used by NOTE and CHECKLIST.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WORLD_HEIGHT_PX, WORLD_WIDTH_PX } from "@/lib/canvas/world-camera";
import {
  applyLabObjectResize,
  clampLabObjectSize,
  frameFromCenterPct,
  LAB_SPAWN_OFFSET_PCT,
  nextLabSpawnPct,
  worldDeltaToLabSizePct,
  type LabObjectSizeLimits,
} from "@/lib/modules/lab-object-size";

const LIMITS: LabObjectSizeLimits = {
  widthPctMin: (160 / WORLD_WIDTH_PX) * 100,
  heightPctMin: (96 / WORLD_HEIGHT_PX) * 100,
  widthPctMax: (960 / WORLD_WIDTH_PX) * 100,
  heightPctMax: (800 / WORLD_HEIGHT_PX) * 100,
  widthPctDefault: (256 / WORLD_WIDTH_PX) * 100,
  heightPctDefault: (136 / WORLD_HEIGHT_PX) * 100,
};

describe("Lab object size helpers", () => {
  it("clamps resize to min, max, and remaining world room", () => {
    const shrunk = applyLabObjectResize({
      widthPct: LIMITS.widthPctDefault,
      heightPct: LIMITS.heightPctDefault,
      originLeftPct: 20,
      originTopPct: 20,
      deltaWidthPct: -100,
      deltaHeightPct: -100,
      limits: LIMITS,
    });
    assert.equal(shrunk.widthPct, LIMITS.widthPctMin);
    assert.equal(shrunk.heightPct, LIMITS.heightPctMin);

    const grown = applyLabObjectResize({
      widthPct: LIMITS.widthPctDefault,
      heightPct: LIMITS.heightPctDefault,
      originLeftPct: 10,
      originTopPct: 10,
      deltaWidthPct: 100,
      deltaHeightPct: 100,
      limits: LIMITS,
    });
    assert.equal(grown.widthPct, LIMITS.widthPctMax);
    assert.equal(grown.heightPct, LIMITS.heightPctMax);

    const againstEdge = applyLabObjectResize({
      widthPct: LIMITS.widthPctDefault,
      heightPct: LIMITS.heightPctDefault,
      originLeftPct: 95,
      originTopPct: 96,
      deltaWidthPct: 50,
      deltaHeightPct: 50,
      limits: LIMITS,
    });
    assert.ok(againstEdge.widthPct <= 5);
    assert.ok(againstEdge.heightPct <= 4);
  });

  it("resizes width and height independently from pointer world delta", () => {
    const delta = worldDeltaToLabSizePct(480, 0);
    assert.equal(delta.deltaWidthPct, 10);
    assert.equal(delta.deltaHeightPct, 0);
    const next = applyLabObjectResize({
      widthPct: LIMITS.widthPctDefault,
      heightPct: LIMITS.heightPctDefault,
      originLeftPct: 20,
      originTopPct: 20,
      deltaWidthPct: delta.deltaWidthPct,
      deltaHeightPct: delta.deltaHeightPct,
      limits: LIMITS,
    });
    assert.equal(next.widthPct, LIMITS.widthPctDefault + 10);
    assert.equal(next.heightPct, LIMITS.heightPctDefault);
  });

  it("fits a default frame around a spawn center", () => {
    const frame = frameFromCenterPct({
      leftPct: 50,
      topPct: 50,
      limits: LIMITS,
    });
    assert.equal(frame.widthPct, LIMITS.widthPctDefault);
    assert.equal(frame.heightPct, LIMITS.heightPctDefault);
    assert.ok(frame.leftPct < 50);
    assert.ok(frame.topPct < 50);
    assert.ok(frame.leftPct + frame.widthPct > 50);
  });

  it("offsets later spawns so instances do not share an origin", () => {
    const base = { leftPct: 50, topPct: 40 };
    const first = nextLabSpawnPct(0, base);
    const second = nextLabSpawnPct(1, base);
    const seventh = nextLabSpawnPct(6, base);
    assert.deepEqual(first, base);
    assert.equal(second.leftPct, 50 + LAB_SPAWN_OFFSET_PCT);
    assert.equal(second.topPct, 40);
    assert.equal(seventh.leftPct, 50);
    assert.equal(seventh.topPct, 40 + LAB_SPAWN_OFFSET_PCT);
  });

  it("falls back to default size for non-finite input", () => {
    const size = clampLabObjectSize({
      widthPct: Number.NaN,
      heightPct: Number.POSITIVE_INFINITY,
      originLeftPct: 10,
      originTopPct: 10,
      limits: LIMITS,
    });
    assert.equal(size.widthPct, LIMITS.widthPctDefault);
    assert.equal(size.heightPct, LIMITS.heightPctDefault);
  });
});
