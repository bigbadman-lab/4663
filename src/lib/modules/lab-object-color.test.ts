/**
 * Shared Lab object colour vocabulary.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_LAB_OBJECT_COLOR,
  isLabObjectColor,
  LAB_OBJECT_COLOR_IDS,
  LAB_OBJECT_COLORS,
  labObjectColorVisual,
  normalizeLabObjectColor,
} from "@/lib/modules/lab-object-color";

describe("Lab object colours", () => {
  it("exposes eight curated colour ids with bone as default", () => {
    assert.deepEqual(LAB_OBJECT_COLOR_IDS, [
      "bone",
      "yellow",
      "blue",
      "green",
      "pink",
      "purple",
      "orange",
      "dark",
    ]);
    assert.equal(DEFAULT_LAB_OBJECT_COLOR, "bone");
    assert.equal(isLabObjectColor("bone"), true);
    assert.equal(isLabObjectColor("yellow"), true);
    assert.equal(isLabObjectColor("countdown"), false);
    assert.equal(isLabObjectColor("white"), false);
  });

  it("resolves every colour to a usable visual definition", () => {
    for (const id of LAB_OBJECT_COLOR_IDS) {
      const visual = LAB_OBJECT_COLORS[id];
      assert.equal(typeof visual.background, "string");
      assert.equal(visual.background.startsWith("#"), true);
      assert.equal(visual.background.length, 7);
      assert.equal(typeof visual.foreground, "string");
      assert.equal(visual.foreground.startsWith("#"), true);
      assert.equal(typeof visual.border, "string");
      assert.equal(typeof visual.muted, "string");
      assert.notEqual(visual.background, visual.foreground);
      assert.deepEqual(labObjectColorVisual(id), visual);
    }
    assert.equal(LAB_OBJECT_COLORS.bone.background, "#F3F0E7");
    assert.equal(LAB_OBJECT_COLORS.bone.foreground, "#171717");
    assert.equal(LAB_OBJECT_COLORS.dark.background, "#171717");
    assert.equal(LAB_OBJECT_COLORS.dark.foreground, "#F3F0E7");
  });

  it("normalizes missing and invalid persisted colours to the default", () => {
    assert.equal(normalizeLabObjectColor(undefined), "bone");
    assert.equal(normalizeLabObjectColor(null), "bone");
    assert.equal(normalizeLabObjectColor("not-a-colour"), "bone");
    assert.equal(normalizeLabObjectColor("YELLOW"), "bone");
    assert.equal(normalizeLabObjectColor("green"), "green");
    assert.deepEqual(
      labObjectColorVisual("nope"),
      LAB_OBJECT_COLORS.bone,
    );
  });
});
