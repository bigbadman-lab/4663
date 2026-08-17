/**
 * Shared interactive canvas target + overlay hit geometry.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INTERACTIVE_CANVAS_TARGET_SELECTOR,
  INTERACTIVE_CONTROL_ATTR,
  INTERACTIVE_CONTROL_SELECTOR,
  WORLD_MOVABLE_HIT_SELECTOR,
  activateOverlayInteractiveTarget,
  isInteractiveCanvasControlTarget,
  isInteractiveCanvasTarget,
  isWorldMovableHitTarget,
  overlayInteractiveTargetFromPoint,
} from "@/lib/canvas/interactive-control";

function mockClosest(tag: string, extra: Record<string, unknown> = {}) {
  return {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    closest(selector: string) {
      if (selector === INTERACTIVE_CONTROL_SELECTOR) {
        return extra[INTERACTIVE_CONTROL_ATTR] ? this : null;
      }
      if (selector === INTERACTIVE_CANVAS_TARGET_SELECTOR) {
        if (
          extra[INTERACTIVE_CONTROL_ATTR] ||
          ["A", "BUTTON", "INPUT", "TEXTAREA", "SELECT", "LABEL", "SUMMARY"].includes(
            tag.toUpperCase(),
          ) ||
          extra.role === "button" ||
          extra.role === "link" ||
          extra.role === "menuitem" ||
          extra.contentEditable === "true"
        ) {
          return this;
        }
        return extra.closestInteractive ? extra.closestInteractive : null;
      }
      return null;
    },
    ...extra,
  };
}

describe("isInteractiveCanvasTarget", () => {
  it("rejects null and non-elements", () => {
    assert.equal(isInteractiveCanvasTarget(null), false);
    assert.equal(isInteractiveCanvasTarget({} as EventTarget), false);
    assert.equal(isInteractiveCanvasControlTarget(null), false);
  });

  it("matches semantic controls and nested children via closest", () => {
    const button = mockClosest("button");
    assert.equal(isInteractiveCanvasTarget(button as unknown as EventTarget), true);

    const icon = mockClosest("span", { closestInteractive: button });
    assert.equal(isInteractiveCanvasTarget(icon as unknown as EventTarget), true);

    const link = mockClosest("a");
    assert.equal(isInteractiveCanvasTarget(link as unknown as EventTarget), true);

    const input = mockClosest("input");
    assert.equal(isInteractiveCanvasTarget(input as unknown as EventTarget), true);

    const textarea = mockClosest("textarea");
    assert.equal(isInteractiveCanvasTarget(textarea as unknown as EventTarget), true);

    const roleButton = mockClosest("div", { role: "button" });
    assert.equal(
      isInteractiveCanvasTarget(roleButton as unknown as EventTarget),
      true,
    );
  });

  it("matches explicit 4663 opt-out attribute", () => {
    const marked = mockClosest("div", { [INTERACTIVE_CONTROL_ATTR]: true });
    assert.equal(isInteractiveCanvasTarget(marked as unknown as EventTarget), true);
    assert.equal(
      isInteractiveCanvasControlTarget(marked as unknown as EventTarget),
      true,
    );
  });

  it("does not treat generic canvas surfaces as interactive", () => {
    const empty = mockClosest("div");
    assert.equal(isInteractiveCanvasTarget(empty as unknown as EventTarget), false);
    assert.equal(
      isInteractiveCanvasControlTarget(empty as unknown as EventTarget),
      false,
    );
  });
});

describe("overlayInteractiveTargetFromPoint", () => {
  it("matches overlay chrome buttons by layout box, including nested icons", () => {
    const clicks: string[] = [];
    const button = {
      closest(selector: string) {
        if (selector === INTERACTIVE_CANVAS_TARGET_SELECTOR) return button;
        if (selector === "[data-4663-canvas-chrome], [data-4663-control-dock]") {
          return chrome;
        }
        return null;
      },
      getBoundingClientRect() {
        return { left: 100, right: 180, top: 400, bottom: 444, width: 80, height: 44 };
      },
      click() {
        clicks.push("enter");
      },
    };
    const icon = {
      closest(selector: string) {
        if (selector === INTERACTIVE_CANVAS_TARGET_SELECTOR) return button;
        return button.closest(selector);
      },
      getBoundingClientRect() {
        return { left: 120, right: 140, top: 410, bottom: 430, width: 20, height: 20 };
      },
    };
    const chrome = {
      querySelectorAll(selector: string) {
        if (selector === "[data-4663-canvas-chrome], [data-4663-control-dock]") {
          return [chrome];
        }
        if (selector === INTERACTIVE_CANVAS_TARGET_SELECTOR) {
          return [button, icon];
        }
        return [];
      },
    };
    const root = {
      querySelectorAll(selector: string) {
        if (selector === "[data-4663-canvas-chrome], [data-4663-control-dock]") {
          return [chrome];
        }
        return [];
      },
    };

    const hit = overlayInteractiveTargetFromPoint(130, 420, root as unknown as ParentNode);
    assert.equal(hit, button);
    activateOverlayInteractiveTarget(hit!);
    assert.deepEqual(clicks, ["enter"]);

    assert.equal(
      overlayInteractiveTargetFromPoint(10, 10, root as unknown as ParentNode),
      null,
    );
  });

  it("returns null without a search root", () => {
    assert.equal(overlayInteractiveTargetFromPoint(0, 0, null), null);
  });

  it("does not recover HERO when a world PlayHTML object owns the point", () => {
    const world = { id: "world" };
    const radar = {
      closest(selector: string) {
        if (selector.includes("canvas-empty-hit") || selector.includes("world-pan-hit")) {
          return null;
        }
        if (selector === "[data-4663-canvas-world]") return world;
        if (selector === "[data-4663-home-region]") return null;
        if (selector === "[data-4663-radar-alerts]") return { id: "alerts" };
        return null;
      },
      getBoundingClientRect() {
        return { left: 400, right: 560, top: 280, bottom: 460, width: 160, height: 180 };
      },
    };
    const hero = {
      closest(selector: string) {
        if (selector === INTERACTIVE_CANVAS_TARGET_SELECTOR) return hero;
        if (selector === "[data-4663-canvas-chrome], [data-4663-control-dock]") {
          return chrome;
        }
        return null;
      },
      getBoundingClientRect() {
        return { left: 200, right: 900, top: 250, bottom: 500, width: 700, height: 250 };
      },
      click() {
        throw new Error("HERO must not be recovered over a world object");
      },
    };
    const chrome = {
      querySelectorAll(selector: string) {
        if (selector === INTERACTIVE_CANVAS_TARGET_SELECTOR) return [hero];
        return [];
      },
    };
    const root = {
      elementsFromPoint() {
        return [radar, hero];
      },
      querySelectorAll(selector: string) {
        if (selector === WORLD_MOVABLE_HIT_SELECTOR) return [radar];
        if (selector === "[data-4663-canvas-chrome], [data-4663-control-dock]") {
          return [chrome];
        }
        return [];
      },
    };

    assert.equal(isWorldMovableHitTarget(radar as unknown as EventTarget), true);
    assert.equal(
      overlayInteractiveTargetFromPoint(480, 360, root as unknown as ParentNode),
      null,
    );
  });

  it("recovers LINK OPEN on a world object instead of starting pan", () => {
    const clicks: string[] = [];
    const world = { id: "world" };
    const open = {
      closest(selector: string) {
        if (selector.includes("canvas-empty-hit") || selector.includes("world-pan-hit")) {
          return null;
        }
        if (selector === INTERACTIVE_CANVAS_TARGET_SELECTOR) return open;
        if (selector === "[data-4663-canvas-world]") return world;
        if (selector === "[data-4663-home-region]") return null;
        if (selector === "[data-4663-radar-alerts]") return null;
        return null;
      },
      getBoundingClientRect() {
        return { left: 470, right: 540, top: 420, bottom: 444, width: 70, height: 24 };
      },
      click() {
        clicks.push("open");
      },
    };
    const root = {
      elementsFromPoint() {
        return [open];
      },
      querySelectorAll() {
        return [];
      },
    };

    assert.equal(isWorldMovableHitTarget(open as unknown as EventTarget), true);
    assert.equal(isInteractiveCanvasTarget(open as unknown as EventTarget), true);
    const hit = overlayInteractiveTargetFromPoint(
      500,
      430,
      root as unknown as ParentNode,
    );
    assert.equal(hit, open);
    activateOverlayInteractiveTarget(hit!);
    assert.deepEqual(clicks, ["open"]);
  });

  it("recovers SNAPSHOT dock control even when a world object overlaps the point", () => {
    const clicks: string[] = [];
    const world = { id: "world" };
    const radar = {
      closest(selector: string) {
        if (selector.includes("canvas-empty-hit") || selector.includes("world-pan-hit")) {
          return null;
        }
        if (selector === "[data-4663-canvas-world]") return world;
        if (selector === "[data-4663-home-region]") return null;
        if (selector === "[data-4663-radar-alerts]") return { id: "alerts" };
        return null;
      },
      getBoundingClientRect() {
        return { left: 200, right: 900, top: 400, bottom: 900, width: 700, height: 500 };
      },
    };
    const dock: {
      id: string;
      querySelectorAll: (selector: string) => unknown[];
    } = {
      id: "dock",
      querySelectorAll() {
        return [];
      },
    };
    const snapshot = {
      closest(selector: string) {
        if (selector === INTERACTIVE_CANVAS_TARGET_SELECTOR) return snapshot;
        if (selector === "[data-4663-canvas-chrome], [data-4663-control-dock]") {
          return dock;
        }
        if (selector === "[data-4663-control-dock]") return dock;
        return null;
      },
      getBoundingClientRect() {
        return { left: 420, right: 540, top: 720, bottom: 764, width: 120, height: 44 };
      },
      click() {
        clicks.push("snapshot");
      },
    };
    dock.querySelectorAll = (selector: string) => {
      if (selector === INTERACTIVE_CANVAS_TARGET_SELECTOR) return [snapshot];
      return [];
    };
    const root = {
      elementsFromPoint() {
        return [radar, snapshot];
      },
      querySelectorAll(selector: string) {
        if (selector === WORLD_MOVABLE_HIT_SELECTOR) return [radar];
        if (selector === "[data-4663-control-dock]") return [dock];
        if (selector === "[data-4663-canvas-chrome], [data-4663-control-dock]") {
          return [dock];
        }
        return [];
      },
    };

    const hit = overlayInteractiveTargetFromPoint(
      480,
      740,
      root as unknown as ParentNode,
    );
    assert.equal(hit, snapshot);
    activateOverlayInteractiveTarget(hit!);
    assert.deepEqual(clicks, ["snapshot"]);
  });

  it("still recovers genuine chrome when the world miss is empty-hit", () => {
    const clicks: string[] = [];
    const emptyHit = {
      closest(selector: string) {
        if (selector.includes("canvas-empty-hit") || selector.includes("world-pan-hit")) {
          return this;
        }
        if (selector === "[data-4663-canvas-world]") return { id: "world" };
        return null;
      },
    };
    const enter = {
      closest(selector: string) {
        if (selector === INTERACTIVE_CANVAS_TARGET_SELECTOR) return enter;
        if (selector === "[data-4663-canvas-chrome], [data-4663-control-dock]") {
          return chrome;
        }
        return null;
      },
      getBoundingClientRect() {
        return { left: 300, right: 420, top: 500, bottom: 544, width: 120, height: 44 };
      },
      click() {
        clicks.push("enter");
      },
    };
    const chrome = {
      querySelectorAll(selector: string) {
        if (selector === INTERACTIVE_CANVAS_TARGET_SELECTOR) return [enter];
        return [];
      },
    };
    const root = {
      elementsFromPoint() {
        return [emptyHit, enter];
      },
      querySelectorAll(selector: string) {
        if (selector === WORLD_MOVABLE_HIT_SELECTOR) return [];
        if (selector === "[data-4663-canvas-chrome], [data-4663-control-dock]") {
          return [chrome];
        }
        return [];
      },
    };

    assert.equal(isWorldMovableHitTarget(emptyHit as unknown as EventTarget), false);
    const hit = overlayInteractiveTargetFromPoint(
      360,
      520,
      root as unknown as ParentNode,
    );
    assert.equal(hit, enter);
    activateOverlayInteractiveTarget(hit!);
    assert.deepEqual(clicks, ["enter"]);
  });
});

describe("isWorldMovableHitTarget", () => {
  it("accepts world objects and rejects pan/shell hits", () => {
    const world = { id: "world" };
    const radar = {
      closest(selector: string) {
        if (selector.includes("canvas-empty-hit")) return null;
        if (selector === "[data-4663-canvas-world]") return world;
        if (selector === "[data-4663-home-region]") return null;
        if (selector === "[data-4663-radar-alerts]") return { id: "layer" };
        return null;
      },
    };
    const empty = {
      closest(selector: string) {
        if (selector.includes("canvas-empty-hit") || selector.includes("world-pan-hit")) {
          return this;
        }
        if (selector === "[data-4663-canvas-world]") return world;
        return null;
      },
    };
    const shell = {
      closest(selector: string) {
        if (selector === "[data-4663-canvas-world]") return this;
        return null;
      },
    };
    assert.equal(isWorldMovableHitTarget(null), false);
    assert.equal(isWorldMovableHitTarget(radar as unknown as EventTarget), true);
    assert.equal(isWorldMovableHitTarget(empty as unknown as EventTarget), false);
    assert.equal(isWorldMovableHitTarget(shell as unknown as EventTarget), false);
  });
});
