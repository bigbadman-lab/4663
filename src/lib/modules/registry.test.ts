/**
 * Module Lab registry — NOTE V1.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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

  it("lists NOTE as the only installable lab module", () => {
    const listed = listInstallableModules();
    assert.equal(listed.length, 1);
    assert.equal(listed[0], NOTE_MODULE);
    assert.deepEqual(getModuleDefinition("note"), NOTE_MODULE);
    assert.equal(getModuleDefinition("checklist"), null);
    assert.equal(getModuleDefinition("text"), null);
  });
});
