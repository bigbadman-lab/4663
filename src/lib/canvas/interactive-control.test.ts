/**
 * Shared interactive canvas target + overlay hit geometry.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INTERACTIVE_CANVAS_TARGET_SELECTOR,
  INTERACTIVE_CONTROL_ATTR,
  INTERACTIVE_CONTROL_SELECTOR,
  activateOverlayInteractiveTarget,
  isInteractiveCanvasControlTarget,
  isInteractiveCanvasTarget,
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
});
