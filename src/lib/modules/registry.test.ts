/**
 * Module Lab registry — NOTE + CHECKLIST + COUNTDOWN V1.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHECKLIST_MODULE,
  COUNTDOWN_MODULE,
  getModuleDefinition,
  listInstallableModules,
  NOTE_MODULE,
} from "@/lib/modules/registry";

describe("Module Lab registry", () => {
  it("registers NOTE as a free create module with multiple instances", () => {
    assert.equal(NOTE_MODULE.id, "note");
    assert.equal(NOTE_MODULE.displayName, "NOTE");
    assert.equal(NOTE_MODULE.category, "create");
    assert.equal(NOTE_MODULE.tier, "free");
    assert.equal(NOTE_MODULE.multipleInstances, true);
  });

  it("registers CHECKLIST as a free organise module with multiple instances", () => {
    assert.equal(CHECKLIST_MODULE.id, "checklist");
    assert.equal(CHECKLIST_MODULE.displayName, "CHECKLIST");
    assert.equal(CHECKLIST_MODULE.category, "organise");
    assert.equal(CHECKLIST_MODULE.tier, "free");
    assert.equal(CHECKLIST_MODULE.multipleInstances, true);
  });

  it("registers COUNTDOWN as a free organise module with multiple instances", () => {
    assert.equal(COUNTDOWN_MODULE.id, "countdown");
    assert.equal(COUNTDOWN_MODULE.displayName, "COUNTDOWN");
    assert.equal(COUNTDOWN_MODULE.category, "organise");
    assert.equal(COUNTDOWN_MODULE.tier, "free");
    assert.equal(COUNTDOWN_MODULE.multipleInstances, true);
    assert.equal("targetAt" in COUNTDOWN_MODULE, false);
  });

  it("lists NOTE, CHECKLIST, and COUNTDOWN as the installable lab modules", () => {
    const listed = listInstallableModules();
    assert.equal(listed.length, 3);
    assert.equal(listed[0], NOTE_MODULE);
    assert.equal(listed[1], CHECKLIST_MODULE);
    assert.equal(listed[2], COUNTDOWN_MODULE);
    assert.deepEqual(getModuleDefinition("note"), NOTE_MODULE);
    assert.deepEqual(getModuleDefinition("checklist"), CHECKLIST_MODULE);
    assert.deepEqual(getModuleDefinition("countdown"), COUNTDOWN_MODULE);
    assert.equal(getModuleDefinition("board"), null);
    assert.equal(getModuleDefinition("text"), null);
  });

  it("does not put colour or countdown config on the module catalogue", () => {
    assert.equal("color" in NOTE_MODULE, false);
    assert.equal("color" in CHECKLIST_MODULE, false);
    assert.equal("color" in COUNTDOWN_MODULE, false);
    assert.equal("palette" in NOTE_MODULE, false);
  });
});
