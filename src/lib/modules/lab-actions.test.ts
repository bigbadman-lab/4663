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
    const unregisterCountdown = registerModuleLabActions({
      create(moduleId) {
        if (moduleId !== "countdown") return;
        seen.push("countdown");
      },
    });
    const unregisterBoard = registerModuleLabActions({
      create(moduleId) {
        if (moduleId !== "board") return;
        seen.push("board");
      },
    });
    const unregisterCalendar = registerModuleLabActions({
      create(moduleId) {
        if (moduleId !== "calendar") return;
        seen.push("calendar");
      },
    });
    getModuleLabActions().create("countdown");
    assert.deepEqual(seen, ["checklist", "note", "countdown"]);
    getModuleLabActions().create("board");
    assert.deepEqual(seen, ["checklist", "note", "countdown", "board"]);
    getModuleLabActions().create("calendar");
    assert.deepEqual(seen, [
      "checklist",
      "note",
      "countdown",
      "board",
      "calendar",
    ]);
    unregisterNote();
    unregisterChecklist();
    unregisterCountdown();
    unregisterBoard();
    unregisterCalendar();
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
    const unregisterCountdown = registerModuleLabActions({
      reset() {
        resets.push("countdown");
      },
    });
    const unregisterBoard = registerModuleLabActions({
      reset() {
        resets.push("board");
      },
    });
    const unregisterCalendar = registerModuleLabActions({
      reset() {
        resets.push("calendar");
      },
    });
    getModuleLabActions().reset();
    assert.equal(resets.includes("note"), true);
    assert.equal(resets.includes("checklist"), true);
    assert.equal(resets.includes("countdown"), true);
    assert.equal(resets.includes("board"), true);
    assert.equal(resets.includes("calendar"), true);
    assert.equal(resets.length, 5);
    unregisterNote();
    unregisterChecklist();
    unregisterCountdown();
    unregisterBoard();
    unregisterCalendar();
  });
});
