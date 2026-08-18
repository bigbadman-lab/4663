/**
 * PONS MONITOR + RADAR tight hitbox + header-only drag.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isUsableCanvasPointer, shouldTrackCanvasPan } from "@/lib/canvas/canvas-pan-gesture";
import {
  INTERACTIVE_CANVAS_TARGET_SELECTOR,
  isInteractiveCanvasTarget,
} from "@/lib/canvas/interactive-control";
import {
  PLAYHTML_DRAG_HANDLE_ATTR,
  PLAYHTML_DRAG_HANDLE_SELECTOR,
  isPlayhtmlDragHandleTarget,
  playhtmlHostHasDragHandle,
} from "@/lib/canvas/playhtml-drag-handle";
import {
  beginPlayhtmlMoveForeground,
  shouldBeginPlayhtmlMoveForeground,
} from "@/lib/canvas/playhtml-move-interaction";
import {
  PONS_MONITOR_PANEL_HEIGHT_PX,
  PONS_MONITOR_PANEL_WIDTH_PX,
  RADAR_ALERT_WIDTH_PX,
  RADAR_CARD_MAX_WIDTH_PX,
  RADAR_CARD_MIN_WIDTH_PX,
  ponsRadarCenteredHostRect,
  ponsRadarHostMatchesVisible,
  ponsRadarHostTracksContentSize,
  ponsRadarOverlapHit,
  ponsRadarOversizedInnerTranslateHostRect,
  ponsRadarRegionStartsMove,
  radarAlertRegionStartsMove,
  pointInPonsRadarRect,
  pointJustOutsidePonsRadar,
} from "@/lib/canvas/pons-radar-hitbox";
import { isCanvasPanHitTarget } from "@/lib/canvas/world-camera";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const ORIGIN = { originLeft: 1000, originTop: 800 } as const;

const PONS_RECT = ponsRadarCenteredHostRect({
  ...ORIGIN,
  width: PONS_MONITOR_PANEL_WIDTH_PX,
  height: PONS_MONITOR_PANEL_HEIGHT_PX,
});

const RADAR_CARD_RECT = ponsRadarCenteredHostRect({
  ...ORIGIN,
  width: RADAR_CARD_MAX_WIDTH_PX,
  height: 220,
});

const RADAR_ALERT_RECT = ponsRadarCenteredHostRect({
  ...ORIGIN,
  width: RADAR_ALERT_WIDTH_PX,
  height: 240,
});

function interactiveTarget() {
  return {
    closest(selector: string) {
      if (
        selector === INTERACTIVE_CANVAS_TARGET_SELECTOR ||
        selector.includes("button") ||
        selector.includes("a")
      ) {
        return this;
      }
      return null;
    },
  };
}

function headerTarget() {
  return {
    closest(selector: string) {
      if (selector === PLAYHTML_DRAG_HANDLE_SELECTOR) return this;
      return null;
    },
  };
}

function bodyTarget() {
  return {
    closest() {
      return null;
    },
  };
}

function handleHost(hasHandle: boolean) {
  let zIndex = "";
  const captured = new Set<number>();
  return {
    style: {
      get zIndex() {
        return zIndex;
      },
      set zIndex(value: string) {
        zIndex = value;
      },
    },
    setAttribute() {},
    querySelector(selector: string) {
      if (!hasHandle) return null;
      return selector === PLAYHTML_DRAG_HANDLE_SELECTOR ? headerTarget() : null;
    },
    setPointerCapture(id: number) {
      captured.add(id);
    },
    hasPointerCapture(id: number) {
      return captured.has(id);
    },
    releasePointerCapture(id: number) {
      captured.delete(id);
    },
    captured,
  };
}

function neighbourBeside(
  rect: { left: number; top: number; width: number; height: number },
  side: "left" | "right" | "top" | "bottom",
) {
  const gap = 1;
  if (side === "left") {
    return { left: rect.left - 80 - gap, top: rect.top, width: 80, height: 64 };
  }
  if (side === "right") {
    return {
      left: rect.left + rect.width + gap,
      top: rect.top,
      width: 80,
      height: 64,
    };
  }
  if (side === "top") {
    return { left: rect.left, top: rect.top - 64 - gap, width: 80, height: 64 };
  }
  return {
    left: rect.left,
    top: rect.top + rect.height + gap,
    width: 80,
    height: 64,
  };
}

describe("PONS MONITOR tight hitbox + header drag", () => {
  it("1. Host bounds match visible panel bounds", () => {
    assert.equal(ponsRadarHostMatchesVisible(PONS_RECT, PONS_RECT), true);
    const host = readSrc("src/components/canvas/pons-monitor-terminal.tsx");
    const movable = readSrc(
      "src/components/canvas/movable-pons-monitor-terminal.tsx",
    );
    assert.ok(host.includes("-translate-x-1/2 -translate-y-1/2"));
    assert.ok(
      host.includes(
        "pointer-events-auto absolute z-[15] -translate-x-1/2 -translate-y-1/2",
      ),
    );
    assert.equal(
      movable.includes('className="-translate-x-1/2 -translate-y-1/2"'),
      false,
    );
    assert.equal(
      /<div className="-translate-x-1\/2 -translate-y-1\/2">/.test(host),
      false,
    );
    assert.ok(host.includes("h-[13.5rem]"));
    assert.ok(host.includes("w-[20rem]"));
    assert.ok(host.includes("sm:h-[14rem] sm:w-[21rem]"));
  });

  it("2. Header starts drag", () => {
    assert.equal(ponsRadarRegionStartsMove("header"), true);
    const host = readSrc("src/components/canvas/pons-monitor-terminal.tsx");
    const movable = readSrc(
      "src/components/canvas/movable-pons-monitor-terminal.tsx",
    );
    assert.ok(host.includes("data-4663-pons-monitor-drag"));
    assert.ok(host.includes("data-4663-pons-monitor-header"));
    assert.ok(host.includes(`${PLAYHTML_DRAG_HANDLE_ATTR}="true"`));
    assert.ok(host.includes("cursor-grab"));
    assert.ok(host.includes("active:cursor-grabbing"));
    const headerBlock = host.slice(
      host.indexOf("data-4663-pons-monitor-header"),
      host.indexOf("data-4663-pons-monitor-body"),
    );
    assert.equal(headerBlock.includes("stopPlayhtmlMoveStart"), false);
    assert.ok(movable.includes("usePlayhtmlMoveForeground"));
    assert.ok(movable.includes("onPointerDown={move.onPointerDown}"));
    const handleHostEl = handleHost(true);
    assert.equal(
      shouldBeginPlayhtmlMoveForeground(
        headerTarget() as unknown as EventTarget,
        handleHostEl as unknown as Element,
      ),
      true,
    );
  });

  it("3. Body does not start drag", () => {
    assert.equal(ponsRadarRegionStartsMove("body"), false);
    const host = readSrc("src/components/canvas/pons-monitor-terminal.tsx");
    assert.ok(host.includes("data-4663-pons-monitor-body"));
    const body = host.slice(host.indexOf("data-4663-pons-monitor-body"));
    assert.ok(body.includes("onPointerDown={stopPlayhtmlMoveStart}"));
    assert.ok(host.includes("bodyRef"));
    const handleHostEl = handleHost(true);
    assert.equal(
      shouldBeginPlayhtmlMoveForeground(
        bodyTarget() as unknown as EventTarget,
        handleHostEl as unknown as Element,
      ),
      false,
    );
  });

  it("4. Internal controls do not start drag", () => {
    assert.equal(ponsRadarRegionStartsMove("control"), false);
    const control = interactiveTarget();
    assert.equal(
      shouldBeginPlayhtmlMoveForeground(control as unknown as EventTarget),
      false,
    );
    const host = handleHost(true);
    assert.equal(
      beginPlayhtmlMoveForeground(host as unknown as HTMLElement, {
        target: control as unknown as EventTarget,
        pointerId: 1,
      }),
      false,
    );
    assert.equal(host.captured.size, 0);
  });

  it("5. Clicking just outside left edge does not target PONS", () => {
    const point = pointJustOutsidePonsRadar(PONS_RECT, "left");
    assert.equal(pointInPonsRadarRect(point, PONS_RECT), false);
  });

  it("6. Clicking just outside right edge does not target PONS", () => {
    const point = pointJustOutsidePonsRadar(PONS_RECT, "right");
    assert.equal(pointInPonsRadarRect(point, PONS_RECT), false);
  });

  it("7. Clicking just outside top edge does not target PONS", () => {
    const point = pointJustOutsidePonsRadar(PONS_RECT, "top");
    assert.equal(pointInPonsRadarRect(point, PONS_RECT), false);
  });

  it("8. Clicking just outside bottom edge does not target PONS", () => {
    const point = pointJustOutsidePonsRadar(PONS_RECT, "bottom");
    assert.equal(pointInPonsRadarRect(point, PONS_RECT), false);
  });

  it("9. Nearby object remains independently draggable", () => {
    for (const side of ["left", "right", "top", "bottom"] as const) {
      const other = neighbourBeside(PONS_RECT, side);
      const inOther = { x: other.left + 10, y: other.top + 10 };
      assert.equal(
        ponsRadarOverlapHit({ object: PONS_RECT, other, point: inOther }),
        "other",
      );
    }
    const oldOversized = ponsRadarOversizedInnerTranslateHostRect({
      ...ORIGIN,
      width: PONS_MONITOR_PANEL_WIDTH_PX,
      height: PONS_MONITOR_PANEL_HEIGHT_PX,
    });
    const ghost = {
      x: oldOversized.left + oldOversized.width - 12,
      y: oldOversized.top + oldOversized.height - 12,
    };
    assert.equal(pointInPonsRadarRect(ghost, PONS_RECT), false);
    assert.equal(
      ponsRadarOverlapHit({
        object: PONS_RECT,
        other: oldOversized,
        point: ghost,
      }),
      "other",
    );
  });
});

describe("RADAR tight hitbox + header drag + OPEN isolation", () => {
  it("10. Host bounds match visible panel bounds", () => {
    assert.equal(
      ponsRadarHostMatchesVisible(RADAR_CARD_RECT, RADAR_CARD_RECT),
      true,
    );
    assert.equal(
      ponsRadarHostMatchesVisible(RADAR_ALERT_RECT, RADAR_ALERT_RECT),
      true,
    );
    const card = readSrc("src/components/canvas/pons-monitoring-object.tsx");
    const movable = readSrc(
      "src/components/canvas/movable-pons-monitoring-object.tsx",
    );
    const alert = readSrc("src/components/canvas/radar-alert-object.tsx");
    assert.ok(card.includes("-translate-x-1/2 -translate-y-1/2"));
    assert.ok(
      card.includes(
        "pointer-events-auto absolute z-[15] -translate-x-1/2 -translate-y-1/2",
      ),
    );
    assert.equal(
      /<div className="-translate-x-1\/2 -translate-y-1\/2">/.test(card),
      false,
    );
    assert.equal(
      movable.includes('className="-translate-x-1/2 -translate-y-1/2"'),
      false,
    );
    assert.ok(card.includes("min-w-[11rem] max-w-[13rem]"));
    assert.ok(alert.includes("w-[10.5rem]"));
    assert.ok(alert.includes("sm:w-[11.5rem]"));
    const hostClass = alert.slice(
      alert.indexOf('className="pointer-events-auto absolute z-[16]'),
      alert.indexOf("data-4663-radar-alert"),
    );
    assert.ok(hostClass.includes("-translate-x-1/2 -translate-y-1/2"));
    assert.ok(hostClass.includes("cursor-grab"));
    assert.equal(RADAR_CARD_MIN_WIDTH_PX < RADAR_CARD_MAX_WIDTH_PX, true);
  });

  it("11. Header starts drag", () => {
    assert.equal(ponsRadarRegionStartsMove("header"), true);
    assert.equal(radarAlertRegionStartsMove("header"), true);
    const card = readSrc("src/components/canvas/pons-monitoring-object.tsx");
    const alert = readSrc("src/components/canvas/radar-alert-object.tsx");
    assert.ok(card.includes("data-4663-pons-monitoring-drag"));
    assert.ok(card.includes("data-4663-pons-monitoring-header"));
    assert.ok(alert.includes("data-4663-radar-alert-drag"));
    assert.ok(alert.includes("data-4663-radar-alert-header"));
    assert.ok(card.includes(`${PLAYHTML_DRAG_HANDLE_ATTR}="true"`));
    assert.equal(alert.includes(`${PLAYHTML_DRAG_HANDLE_ATTR}="true"`), false);
    const cardHeader = card.slice(
      Math.max(0, card.indexOf("data-4663-pons-monitoring-header") - 220),
      card.indexOf("data-4663-pons-monitoring-body"),
    );
    assert.ok(cardHeader.includes("cursor-grab"));
    assert.equal(cardHeader.includes("stopPlayhtmlMoveStart"), false);
    const alertHeader = alert.slice(
      Math.max(0, alert.indexOf("data-4663-radar-alert-header") - 220),
      alert.indexOf("data-4663-radar-alert-body"),
    );
    assert.ok(alertHeader.includes("pointer-events-none"));
    assert.equal(alertHeader.includes("stopPlayhtmlMoveStart"), false);
  });

  it("12. Alert body starts drag; PONS MONITOR body does not", () => {
    assert.equal(ponsRadarRegionStartsMove("body"), false);
    assert.equal(radarAlertRegionStartsMove("body"), true);
    const card = readSrc("src/components/canvas/pons-monitoring-object.tsx");
    const alert = readSrc("src/components/canvas/radar-alert-object.tsx");
    assert.ok(card.includes("data-4663-pons-monitoring-body"));
    assert.ok(alert.includes("data-4663-radar-alert-body"));
    const cardBody = card.slice(
      card.indexOf("data-4663-pons-monitoring-body"),
    );
    assert.ok(cardBody.includes("onPointerDown={stopPlayhtmlMoveStart}"));
    const alertBody = alert.slice(
      Math.max(0, alert.indexOf("data-4663-radar-alert-body") - 180),
      alert.indexOf("data-4663-radar-alert-open"),
    );
    assert.ok(alertBody.includes("pointer-events-none"));
    assert.equal(alertBody.includes("stopPlayhtmlMoveStart"), false);
    assert.equal(alertBody.includes("useInteractiveControlProtection"), false);
    const ponsHost = handleHost(true);
    assert.equal(
      shouldBeginPlayhtmlMoveForeground(
        bodyTarget() as unknown as EventTarget,
        ponsHost as unknown as Element,
      ),
      false,
    );
    const alertHost = handleHost(false);
    assert.equal(
      shouldBeginPlayhtmlMoveForeground(
        bodyTarget() as unknown as EventTarget,
        alertHost as unknown as Element,
      ),
      true,
    );
  });

  it("13. OPEN does not start drag", () => {
    assert.equal(ponsRadarRegionStartsMove("control"), false);
    assert.equal(radarAlertRegionStartsMove("control"), false);
    const card = readSrc("src/components/canvas/pons-monitoring-object.tsx");
    const alert = readSrc("src/components/canvas/radar-alert-object.tsx");
    const cardOpen = card.slice(
      Math.max(0, card.indexOf("data-4663-pons-monitoring-open") - 450),
      card.indexOf("data-4663-pons-monitoring-open") + 700,
    );
    assert.ok(cardOpen.includes("stopPlayhtmlMoveStart"));
    assert.ok(cardOpen.includes("relative z-[1]"));
    const alertOpen = alert.slice(
      Math.max(0, alert.indexOf("data-4663-radar-alert-open") - 450),
      alert.indexOf("data-4663-radar-alert-open") + 700,
    );
    assert.ok(alertOpen.includes("stopPlayhtmlMoveStart"));
    const open = interactiveTarget();
    const host = handleHost(true);
    assert.equal(
      beginPlayhtmlMoveForeground(host as unknown as HTMLElement, {
        target: open as unknown as EventTarget,
        pointerId: 4,
      }),
      false,
    );
  });

  it("14. OPEN still activates correctly", () => {
    const card = readSrc("src/components/canvas/pons-monitoring-object.tsx");
    const alert = readSrc("src/components/canvas/radar-alert-object.tsx");
    assert.ok(card.includes("openPanel()"));
    assert.ok(card.includes("[ OPEN ]"));
    assert.ok(card.includes('type="button"'));
    assert.ok(card.includes("useInteractiveControlProtection"));
    assert.ok(alert.includes("onOpen(alert.tokenAddress, alert.launchpad)"));
    assert.ok(alert.includes("{RADAR_ALERT_COPY.cta}"));
    assert.ok(alert.includes("useInteractiveControlProtection"));
    assert.equal(alert.includes("onDismiss"), false);
  });

  it("15. OPEN does not initiate canvas pan", () => {
    const open = interactiveTarget();
    assert.equal(isInteractiveCanvasTarget(open as unknown as EventTarget), true);
    assert.equal(
      shouldTrackCanvasPan({
        isPrimary: true,
        button: 0,
        createUiBlocksPan: false,
        overlayInteractive: null,
        target: open as unknown as EventTarget,
      }),
      false,
    );
    assert.equal(isCanvasPanHitTarget(open as unknown as EventTarget), false);
  });

  it("16. Clicking immediately outside RADAR does not target RADAR", () => {
    for (const rect of [RADAR_CARD_RECT, RADAR_ALERT_RECT]) {
      for (const edge of ["left", "right", "top", "bottom"] as const) {
        const point = pointJustOutsidePonsRadar(rect, edge);
        assert.equal(pointInPonsRadarRect(point, rect), false);
        assert.equal(
          ponsRadarOverlapHit({
            object: rect,
            other: { left: 0, top: 0, width: 1, height: 1 },
            point,
          }),
          "empty",
        );
      }
    }
  });

  it("17. Nearby object remains independently draggable", () => {
    for (const side of ["left", "right", "top", "bottom"] as const) {
      const other = neighbourBeside(RADAR_ALERT_RECT, side);
      const inOther = { x: other.left + 8, y: other.top + 8 };
      assert.equal(
        ponsRadarOverlapHit({
          object: RADAR_ALERT_RECT,
          other,
          point: inOther,
        }),
        "other",
      );
    }
    const oldOversized = ponsRadarOversizedInnerTranslateHostRect({
      ...ORIGIN,
      width: RADAR_ALERT_WIDTH_PX,
      height: 240,
    });
    const ghost = {
      x: oldOversized.left + oldOversized.width - 8,
      y: oldOversized.top + oldOversized.height - 8,
    };
    assert.equal(pointInPonsRadarRect(ghost, RADAR_ALERT_RECT), false);
    assert.equal(
      ponsRadarOverlapHit({
        object: RADAR_ALERT_RECT,
        other: oldOversized,
        point: ghost,
      }),
      "other",
    );
  });

  it("18. Dynamic alert/content changes do not leave stale hit bounds", () => {
    const expanded = ponsRadarCenteredHostRect({
      ...ORIGIN,
      width: RADAR_ALERT_WIDTH_PX,
      height: 280,
    });
    const shrunk = ponsRadarCenteredHostRect({
      ...ORIGIN,
      width: RADAR_ALERT_WIDTH_PX,
      height: 180,
    });
    assert.equal(
      ponsRadarHostTracksContentSize({
        host: shrunk,
        content: { width: RADAR_ALERT_WIDTH_PX, height: 180 },
      }),
      true,
    );
    const staleBottom = {
      x: expanded.left + 20,
      y: expanded.top + expanded.height - 8,
    };
    assert.equal(pointInPonsRadarRect(staleBottom, expanded), true);
    assert.equal(pointInPonsRadarRect(staleBottom, shrunk), false);
    const card = readSrc("src/components/canvas/pons-monitoring-object.tsx");
    const alert = readSrc("src/components/canvas/radar-alert-object.tsx");
    const terminal = readSrc("src/components/canvas/pons-monitor-terminal.tsx");
    assert.equal(card.includes("min-h-["), false);
    assert.equal(alert.includes("min-h-[1"), false);
    assert.ok(terminal.includes("overflow-hidden"));
    assert.ok(card.includes("data-4663-pons-monitoring-count={count}"));
  });
});

describe("PONS / RADAR shared pointer routing", () => {
  it("19. Header drag does not initiate canvas pan", () => {
    const header = headerTarget();
    assert.equal(
      shouldTrackCanvasPan({
        isPrimary: true,
        button: 0,
        createUiBlocksPan: false,
        overlayInteractive: null,
        target: header as unknown as EventTarget,
      }),
      false,
    );
    assert.equal(isCanvasPanHitTarget(header as unknown as EventTarget), false);
    assert.equal(ponsRadarRegionStartsMove("header"), true);
  });

  it("20. PONS MONITOR body click does not initiate object drag", () => {
    assert.equal(ponsRadarRegionStartsMove("body"), false);
    const host = handleHost(true);
    assert.equal(playhtmlHostHasDragHandle(host as unknown as Element), true);
    assert.equal(
      isPlayhtmlDragHandleTarget(bodyTarget() as unknown as EventTarget),
      false,
    );
    assert.equal(
      beginPlayhtmlMoveForeground(host as unknown as HTMLElement, {
        target: bodyTarget() as unknown as EventTarget,
        pointerId: 2,
      }),
      false,
    );
    assert.equal(host.captured.size, 0);
  });

  it("21. Safari-style pointer values remain accepted", () => {
    assert.equal(isUsableCanvasPointer({}), true);
    assert.equal(isUsableCanvasPointer({ button: -1 }), true);
    assert.equal(isUsableCanvasPointer({ isPrimary: false }), false);
    const hook = readSrc(
      "src/components/canvas/use-playhtml-move-foreground.ts",
    );
    assert.ok(hook.includes("event.currentTarget"));
    assert.equal(hook.includes("navigator.userAgent"), false);
    const pan = readSrc("src/lib/canvas/canvas-pan-gesture.ts");
    assert.equal(pan.includes("userAgent"), false);
  });

  it("22. Pointercancel exits drag safely", () => {
    const hook = readSrc(
      "src/components/canvas/use-playhtml-move-foreground.ts",
    );
    const cancel = hook.slice(hook.indexOf("const onPointerCancel"));
    assert.ok(cancel.includes("releasePlayhtmlMovePointer"));
    const terminal = readSrc(
      "src/components/canvas/movable-pons-monitor-terminal.tsx",
    );
    const radar = readSrc(
      "src/components/canvas/movable-pons-monitoring-object.tsx",
    );
    const alert = readSrc("src/components/canvas/radar-alert-object.tsx");
    assert.ok(terminal.includes("onPointerCancel={move.onPointerCancel}"));
    assert.ok(radar.includes("onPointerCancel={move.onPointerCancel}"));
    assert.ok(alert.includes("onPointerCancel={move.onPointerCancel}"));
  });

  it("23. Object move still persists correctly", () => {
    const terminal = readSrc(
      "src/components/canvas/movable-pons-monitor-terminal.tsx",
    );
    const radar = readSrc(
      "src/components/canvas/movable-pons-monitoring-object.tsx",
    );
    const alert = readSrc("src/components/canvas/radar-alert-object.tsx");
    const ids = readSrc("src/components/canvas/pons-monitor-terminal.tsx");
    const monitoring = readSrc(
      "src/components/canvas/pons-monitoring-object.tsx",
    );
    assert.ok(ids.includes('4663-pons-monitor-terminal'));
    assert.ok(monitoring.includes('4663-pons-monitoring'));
    assert.ok(terminal.includes("CanMoveElement"));
    assert.ok(radar.includes("CanMoveElement"));
    assert.ok(alert.includes("CanMoveElement"));
    assert.ok(terminal.includes("bounds={PLAYHTML_CANVAS_BOUNDS_ID}"));
    assert.ok(radar.includes("bounds={PLAYHTML_CANVAS_BOUNDS_ID}"));
    assert.ok(alert.includes("playhtmlRadarAlertElementId(alert.eventId)"));
    assert.equal(terminal.includes("ref={move.ref}"), false);
    assert.equal(radar.includes("ref={move.ref}"), false);
  });

  it("24. Empty canvas immediately outside object remains interactive", () => {
    assert.equal(ponsRadarRegionStartsMove("outside"), false);
    assert.equal(radarAlertRegionStartsMove("outside"), false);
    for (const rect of [PONS_RECT, RADAR_CARD_RECT, RADAR_ALERT_RECT]) {
      for (const edge of ["left", "right", "top", "bottom"] as const) {
        const point = pointJustOutsidePonsRadar(rect, edge);
        assert.equal(
          ponsRadarOverlapHit({
            object: rect,
            other: { left: 0, top: 0, width: 1, height: 1 },
            point,
          }),
          "empty",
        );
      }
    }
    const empty = {
      closest(sel: string) {
        if (sel.includes("canvas-empty-hit") || sel.includes("world-pan-hit")) {
          return this;
        }
        return null;
      },
    };
    assert.equal(
      shouldTrackCanvasPan({
        isPrimary: true,
        button: 0,
        createUiBlocksPan: false,
        overlayInteractive: null,
        target: empty as unknown as EventTarget,
      }),
      true,
    );
  });
});
