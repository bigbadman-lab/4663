import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isLaunchpad,
  launchpadDetailLabel,
  launchpadDisplayLabel,
  parseLaunchpad,
} from "@/lib/radar/launchpad";

describe("launchpad domain", () => {
  it("accepts only pons and pools", () => {
    assert.equal(isLaunchpad("pons"), true);
    assert.equal(isLaunchpad("pools"), true);
    assert.equal(isLaunchpad("crowd"), false);
    assert.equal(parseLaunchpad("PONS"), "pons");
    assert.equal(parseLaunchpad("pools"), "pools");
    assert.equal(parseLaunchpad("v2"), null);
    assert.equal(launchpadDisplayLabel("pons"), "PONS");
    assert.equal(launchpadDisplayLabel("pools"), "POOLS");
    assert.equal(
      launchpadDetailLabel({ launchpad: "pons", factoryVersion: "v2" }),
      "PONS · V2",
    );
    assert.equal(
      launchpadDetailLabel({ launchpad: "pons", factoryVersion: "v1" }),
      "PONS · V1",
    );
    assert.equal(
      launchpadDetailLabel({ launchpad: "pools", factoryVersion: "instant-v3.2.0" }),
      "POOLS",
    );
  });
});
