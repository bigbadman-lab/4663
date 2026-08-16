/**
 * Module Lab action bridge — fan-out create/reset to mounted layers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getModuleLabActions,
  registerModuleLabActions,
} from "@/lib/modules/lab-actions";

describe("Module Lab actions", { concurrency: false }, () => {
  it("fans create out to every registered handler without a singleton overwrite", () => {
    const seen: string[] = [];
    const unregisterNote = registerModuleLabActions({
      create(moduleId) {
        if (moduleId !== "note") return;
        seen.push("note");
      },
    });
    const unregisterChecklist = registerModuleLabActions({
      create(moduleId) {
        if (moduleId !== "checklist") return;
        seen.push("checklist");
      },
    });
    getModuleLabActions().create("checklist");
    assert.deepEqual(seen, ["checklist"]);
    getModuleLabActions().create("note");
    assert.deepEqual(seen, ["checklist", "note"]);
    unregisterNote();
    unregisterChecklist();
  });

  it("fans RESET out to every registered handler", () => {
    const resets: string[] = [];
    const unregisterNote = registerModuleLabActions({
      reset() {
        resets.push("note");
      },
    });
    const unregisterChecklist = registerModuleLabActions({
      reset() {
        resets.push("checklist");
      },
    });
    getModuleLabActions().reset();
    assert.equal(resets.includes("note"), true);
    assert.equal(resets.includes("checklist"), true);
    assert.equal(resets.length, 2);
    unregisterNote();
    unregisterChecklist();
  });
});
