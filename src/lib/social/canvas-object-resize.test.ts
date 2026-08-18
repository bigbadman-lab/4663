/**
 * TEXT + DRAW owner resize: scale models, bounds, pointer routing, persistence.
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
import { objectScaleFromCornerDelta, beginObjectScaleResize, finishObjectScaleResize, moveObjectScaleResize } from "@/lib/canvas/object-scale-resize";
import { shouldBeginPlayhtmlMoveForeground } from "@/lib/canvas/playhtml-move-interaction";
import { isCanvasPanHitTarget, WORLD_HEIGHT_PX, WORLD_WIDTH_PX } from "@/lib/canvas/world-camera";
import {
  canvasObjectOverlapHit,
  drawingVisibleRect,
  hostMatchesVisible,
  objectResizeHandleRect,
  pointInCanvasObjectRect,
  pointJustOutsideCanvasObject,
  textCenteredVisibleRect,
} from "@/lib/social/canvas-object-hitbox";
import { DRAWING_STROKE_WIDTH_WORLD_PX } from "@/lib/social/drawing-ink-bounds";
import {
  createEphemeralDrawingObject,
  DRAWING_OBJECT_SCALE_DEFAULT,
  DRAWING_RESIZE_MIN_WORLD_PX,
  DRAWING_SIZE_PCT_MAX,
  DRAWING_SIZE_PCT_MIN,
  drawingDisplaySize,
  drawingHeightPctFromAspect,
  drawingObjectScaleLimits,
  normalizeEphemeralDrawingObject,
  playhtmlDrawingElementId,
  resizeEphemeralDrawing,
  upsertEphemeralDrawing,
} from "@/lib/social/ephemeral-drawing";
import {
  createEphemeralTextObject,
  normalizeEphemeralTextObject,
  playhtmlTextElementId,
  resizeEphemeralText,
  TEXT_FONT_SCALE_DEFAULT,
  TEXT_FONT_SCALE_MAX,
  TEXT_FONT_SCALE_MIN,
  TEXT_FONT_SIZE_PX,
  TEXT_MAX_WIDTH_REM,
  textFontSizePx,
  textMaxWidthCss,
  textWrapRatio,
  upsertEphemeralText,
} from "@/lib/social/ephemeral-text";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const OWNER_A = "550e8400-e29b-41d4-a716-446655440000";
const OWNER_B = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const TEXT_A = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const DRAW_A = "8c9e6679-7425-40de-944b-e07fc1f90ae8";

const stroke = {
  colour: "#171717" as const,
  points: [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.8 },
  ],
};

function makeDrawing(overrides?: { scale?: number; widthPct?: number }) {
  const created = createEphemeralDrawingObject({
    drawingId: DRAW_A,
    ownerSessionId: OWNER_A,
    strokes: [stroke],
    leftPct: 20,
    topPct: 25,
    widthPct: overrides?.widthPct ?? 4,
    heightPct: 3,
    aspectRatio: 1.5,
    now: () => new Date("2026-08-18T00:00:00.000Z"),
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("expected drawing");
  if (overrides?.scale == null) return created.drawing;
  return { ...created.drawing, scale: overrides.scale };
}

function makeText() {
  const created = createEphemeralTextObject({
    body: "hello\nworld",
    ownerSessionId: OWNER_A,
    leftPct: 40,
    topPct: 50,
    randomUUID: () => TEXT_A,
    now: () => new Date("2026-08-18T00:00:00.000Z"),
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("expected text");
  return created.text;
}

function resizeButtonTarget() {
  return {
    closest(selector: string) {
      if (
        selector === INTERACTIVE_CANVAS_TARGET_SELECTOR ||
        selector.includes("button")
      ) {
        return this;
      }
      return null;
    },
  };
}

describe("DRAW object resize", () => {
  it("1. resize handle renders for owner", () => {
    const object = readSrc("src/components/social/ephemeral-drawing-object.tsx");
    assert.ok(object.includes("ObjectResizeHandle"));
    assert.ok(object.includes("data-4663-ephemeral-drawing-resize"));
    assert.ok(object.includes("{isOwner ? ("));
    assert.ok(object.includes('ariaLabel="Resize drawing"'));
  });

  it("2. resize handle does not render when ownership rules prohibit it", () => {
    const object = readSrc("src/components/social/ephemeral-drawing-object.tsx");
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(object.includes("isOwner"));
    assert.ok(layer.includes("ownerSessionId !== self.sessionId"));
    assert.ok(layer.includes("onResizeDrawing"));
    const handleBlock = object.slice(object.indexOf("<ObjectResizeHandle"));
    assert.ok(object.includes("isOwner ? ("));
    assert.ok(handleBlock.includes("dataAttr=\"data-4663-ephemeral-drawing-resize\""));
  });

  it("3. dragging handle increases DRAW size", () => {
    const drawing = makeDrawing();
    const next = objectScaleFromCornerDelta({
      startWidthPx: 100,
      startHeightPx: 50,
      startScale: drawing.scale,
      deltaX: 50,
      deltaY: 25,
      minScale: 0.25,
      maxScale: 8,
    });
    const resized = resizeEphemeralDrawing(
      { drawings: [drawing] },
      drawing.drawingId,
      next,
    ).drawings[0]!;
    assert.ok(resized.scale > drawing.scale);
    assert.ok(
      drawingDisplaySize(resized).widthPct >
        drawingDisplaySize(drawing).widthPct,
    );
  });

  it("4. dragging handle decreases DRAW size", () => {
    const drawing = makeDrawing({ scale: 2 });
    const next = objectScaleFromCornerDelta({
      startWidthPx: 200,
      startHeightPx: 100,
      startScale: drawing.scale,
      deltaX: -80,
      deltaY: -40,
      minScale: 0.25,
      maxScale: 8,
    });
    const resized = resizeEphemeralDrawing(
      { drawings: [drawing] },
      drawing.drawingId,
      next,
    ).drawings[0]!;
    assert.ok(resized.scale < drawing.scale);
  });

  it("5. aspect ratio is preserved", () => {
    const drawing = makeDrawing();
    const before = drawingDisplaySize(drawing);
    const resized = resizeEphemeralDrawing(
      { drawings: [drawing] },
      drawing.drawingId,
      2,
    ).drawings[0]!;
    const after = drawingDisplaySize(resized);
    assert.equal(drawing.aspectRatio, resized.aspectRatio);
    const beforeAspect =
      ((before.widthPct / 100) * WORLD_WIDTH_PX) /
      ((before.heightPct / 100) * WORLD_HEIGHT_PX);
    const afterAspect =
      ((after.widthPct / 100) * WORLD_WIDTH_PX) /
      ((after.heightPct / 100) * WORLD_HEIGHT_PX);
    assert.ok(Math.abs(beforeAspect - afterAspect) < 1e-9);
    assert.ok(Math.abs(afterAspect - drawing.aspectRatio) < 1e-9);
  });

  it("6. top-left/world anchor stays fixed", () => {
    const drawing = makeDrawing();
    const resized = resizeEphemeralDrawing(
      { drawings: [drawing] },
      drawing.drawingId,
      2,
    ).drawings[0]!;
    assert.equal(resized.leftPct, drawing.leftPct);
    assert.equal(resized.topPct, drawing.topPct);
  });

  it("7. stroke geometry scales correctly without mutating points", () => {
    const drawing = makeDrawing();
    const resized = resizeEphemeralDrawing(
      { drawings: [drawing] },
      drawing.drawingId,
      2,
    ).drawings[0]!;
    assert.deepEqual(resized.strokes, drawing.strokes);
    assert.equal(resized.widthPct, drawing.widthPct);
    const before = drawingDisplaySize(drawing);
    const after = drawingDisplaySize(resized);
    assert.ok(Math.abs(after.widthPct / before.widthPct - 2) < 1e-9);
  });

  it("8. stroke width scales with the object", () => {
    const drawing = makeDrawing();
    const resized = resizeEphemeralDrawing(
      { drawings: [drawing] },
      drawing.drawingId,
      2,
    ).drawings[0]!;
    const svg = readSrc("src/components/social/drawing-strokes-svg.tsx");
    const object = readSrc("src/components/social/ephemeral-drawing-object.tsx");
    assert.ok(svg.includes("DRAWING_STROKE_WIDTH_WORLD_PX * scale"));
    assert.ok(object.includes("strokeScale={display.scale}"));
    assert.equal(
      DRAWING_STROKE_WIDTH_WORLD_PX * resized.scale,
      DRAWING_STROKE_WIDTH_WORLD_PX * 2,
    );
  });

  it("9. tight hitbox remains tight after resize", () => {
    const drawing = makeDrawing();
    const resized = drawingDisplaySize(
      resizeEphemeralDrawing({ drawings: [drawing] }, drawing.drawingId, 2)
        .drawings[0]!,
    );
    const visible = drawingVisibleRect({
      left: drawing.leftPct,
      top: drawing.topPct,
      width: resized.widthPct,
      height: resized.heightPct,
    });
    const host = drawingVisibleRect({
      left: drawing.leftPct,
      top: drawing.topPct,
      width: resized.widthPct,
      height: resized.heightPct,
    });
    assert.equal(hostMatchesVisible(host, visible), true);
  });

  it("10. thick strokes stay inside the host (radius/viewBox invariant)", () => {
    const drawing = makeDrawing();
    const before = drawingDisplaySize(drawing);
    const after = drawingDisplaySize(
      resizeEphemeralDrawing({ drawings: [drawing] }, drawing.drawingId, 2)
        .drawings[0]!,
    );
    const beforeHostW = (before.widthPct / 100) * WORLD_WIDTH_PX;
    const afterHostW = (after.widthPct / 100) * WORLD_WIDTH_PX;
    const beforeFrac =
      (DRAWING_STROKE_WIDTH_WORLD_PX * before.scale) / beforeHostW;
    const afterFrac =
      (DRAWING_STROKE_WIDTH_WORLD_PX * after.scale) / afterHostW;
    assert.ok(Math.abs(beforeFrac - afterFrac) < 1e-9);
    assert.ok(beforeFrac < 1);
  });

  it("11. minimum size clamp", () => {
    const drawing = makeDrawing();
    const { min } = drawingObjectScaleLimits(drawing);
    const resized = resizeEphemeralDrawing(
      { drawings: [drawing] },
      drawing.drawingId,
      0,
    ).drawings[0]!;
    assert.equal(resized.scale, min);
    const display = drawingDisplaySize(resized);
    assert.ok(display.widthPct >= DRAWING_SIZE_PCT_MIN - 1e-9);
    const widthPx = (display.widthPct / 100) * WORLD_WIDTH_PX;
    assert.ok(widthPx + 1e-6 >= DRAWING_RESIZE_MIN_WORLD_PX);
  });

  it("12. maximum size clamp", () => {
    const drawing = makeDrawing();
    const { max } = drawingObjectScaleLimits(drawing);
    const resized = resizeEphemeralDrawing(
      { drawings: [drawing] },
      drawing.drawingId,
      99,
    ).drawings[0]!;
    assert.equal(resized.scale, max);
    const display = drawingDisplaySize(resized);
    assert.ok(display.widthPct <= DRAWING_SIZE_PCT_MAX + 1e-9);
    assert.ok(display.widthPct + drawing.leftPct <= 100 + 1e-9);
  });

  it("13. resize then move keeps origin and PlayHTML move wiring", () => {
    const drawing = makeDrawing();
    const resized = resizeEphemeralDrawing(
      { drawings: [drawing] },
      drawing.drawingId,
      2,
    ).drawings[0]!;
    assert.equal(resized.leftPct, drawing.leftPct);
    assert.equal(resized.topPct, drawing.topPct);
    const object = readSrc("src/components/social/ephemeral-drawing-object.tsx");
    assert.ok(object.includes("usePlayhtmlMoveForeground"));
    assert.ok(object.includes("CanMoveElement"));
    assert.ok(object.includes("cursor-grab"));
  });

  it("14. resize then resize again is stable (no geometry drift)", () => {
    const drawing = makeDrawing();
    const once = resizeEphemeralDrawing(
      { drawings: [drawing] },
      drawing.drawingId,
      2,
    ).drawings[0]!;
    const twice = resizeEphemeralDrawing(
      { drawings: [once] },
      drawing.drawingId,
      1.5,
    ).drawings[0]!;
    assert.deepEqual(twice.strokes, drawing.strokes);
    assert.equal(twice.widthPct, drawing.widthPct);
    assert.equal(twice.scale, 1.5);
    const again = resizeEphemeralDrawing(
      { drawings: [twice] },
      drawing.drawingId,
      1.5,
    );
    assert.equal(again.drawings[0]?.scale, 1.5);
  });

  it("15. JSON round-trip preserves size", () => {
    const drawing = makeDrawing({ scale: 1.8 });
    const roundTrip = normalizeEphemeralDrawingObject(
      JSON.parse(JSON.stringify(drawing)) as unknown,
    );
    assert.ok(roundTrip);
    assert.equal(roundTrip!.scale, drawing.scale);
    assert.equal(roundTrip!.widthPct, drawing.widthPct);
    assert.deepEqual(roundTrip!.strokes, drawing.strokes);
  });

  it("16. existing pre-resize DRAW object uses default scale", () => {
    const drawing = makeDrawing();
    const { scale: _scale, ...legacy } = drawing;
    const normalized = normalizeEphemeralDrawingObject(legacy);
    assert.ok(normalized);
    assert.equal(normalized!.scale, DRAWING_OBJECT_SCALE_DEFAULT);
    assert.equal(
      drawingDisplaySize(normalized!).widthPct,
      drawing.widthPct,
    );
  });
});

describe("TEXT object resize", () => {
  it("17. resize increases visible text size", () => {
    const text = makeText();
    const next = resizeEphemeralText({ texts: [text] }, text.textId, 2)
      .texts[0]!;
    assert.equal(textFontSizePx(next.fontScale), TEXT_FONT_SIZE_PX * 2);
    assert.ok(textFontSizePx(next.fontScale) > textFontSizePx(text.fontScale));
  });

  it("18. resize decreases visible text size", () => {
    const text = makeText();
    const grown = resizeEphemeralText({ texts: [text] }, text.textId, 2)
      .texts[0]!;
    const shrunk = resizeEphemeralText({ texts: [grown] }, text.textId, 0.8)
      .texts[0]!;
    assert.ok(textFontSizePx(shrunk.fontScale) < textFontSizePx(grown.fontScale));
  });

  it("19. host bounds recompute around visible text", () => {
    const atOne = textCenteredVisibleRect({
      originLeft: 100,
      originTop: 80,
      contentWidth: 40,
      contentHeight: 20,
      fontScale: 1,
    });
    const atTwo = textCenteredVisibleRect({
      originLeft: 100,
      originTop: 80,
      contentWidth: 40,
      contentHeight: 20,
      fontScale: 2,
    });
    assert.equal(atTwo.width, atOne.width * 2);
    assert.equal(atTwo.height, atOne.height * 2);
    assert.equal(hostMatchesVisible(atTwo, atTwo), true);
  });

  it("20. no oversized empty rectangle is created", () => {
    const visible = textCenteredVisibleRect({
      originLeft: 50,
      originTop: 50,
      contentWidth: 30,
      contentHeight: 12,
      fontScale: 2,
    });
    assert.equal(visible.width, 60);
    assert.equal(visible.height, 24);
    const object = readSrc("src/components/social/ephemeral-text-object.tsx");
    assert.ok(object.includes("textFontSizePx(fontScale)"));
    assert.ok(object.includes("textMaxWidthCss(fontScale)"));
    assert.ok(object.includes("-translate-x-1/2 -translate-y-1/2"));
    assert.equal(object.includes("group relative -translate"), false);
    assert.equal(object.includes("w-[14rem]"), false);
    assert.equal(object.includes("h-[10rem]"), false);
  });

  it("21. minimum font/scale clamp", () => {
    const text = makeText();
    const next = resizeEphemeralText({ texts: [text] }, text.textId, 0.1)
      .texts[0]!;
    assert.equal(next.fontScale, TEXT_FONT_SCALE_MIN);
  });

  it("22. maximum font/scale clamp", () => {
    const text = makeText();
    const next = resizeEphemeralText({ texts: [text] }, text.textId, 99)
      .texts[0]!;
    assert.equal(next.fontScale, TEXT_FONT_SCALE_MAX);
  });

  it("23. existing TEXT objects render at default size", () => {
    const text = makeText();
    const { fontScale: _fontScale, ...legacy } = text;
    const normalized = normalizeEphemeralTextObject(legacy);
    assert.ok(normalized);
    assert.equal(normalized!.fontScale, TEXT_FONT_SCALE_DEFAULT);
    assert.equal(textFontSizePx(normalized!.fontScale), TEXT_FONT_SIZE_PX);
  });

  it("24. resize persists through JSON/reload", () => {
    const text = makeText();
    const resized = resizeEphemeralText({ texts: [text] }, text.textId, 1.5)
      .texts[0]!;
    const roundTrip = normalizeEphemeralTextObject(
      JSON.parse(JSON.stringify(resized)) as unknown,
    );
    assert.ok(roundTrip);
    assert.equal(roundTrip!.fontScale, 1.5);
    assert.equal(roundTrip!.body, text.body);
  });

  it("25. wrapping/line-break behaviour remains deterministic", () => {
    const text = makeText();
    assert.equal(text.body.includes("\n"), true);
    const resized = resizeEphemeralText({ texts: [text] }, text.textId, 2)
      .texts[0]!;
    assert.equal(resized.body, text.body);
    assert.equal(textWrapRatio(), TEXT_MAX_WIDTH_REM / TEXT_FONT_SIZE_PX);
    assert.equal(
      (TEXT_MAX_WIDTH_REM * 2) / (TEXT_FONT_SIZE_PX * 2),
      textWrapRatio(),
    );
    assert.ok(textMaxWidthCss(2).includes(`${TEXT_MAX_WIDTH_REM * 2}rem`));
    const object = readSrc("src/components/social/ephemeral-text-object.tsx");
    assert.ok(object.includes("whitespace-pre-wrap"));
  });
});

describe("TEXT/DRAW resize pointer routing", () => {
  it("26. resize pointerdown does not initiate object move", () => {
    const handle = readSrc("src/components/canvas/object-resize-handle.tsx");
    assert.ok(handle.includes("event.stopPropagation()"));
    assert.ok(handle.includes("setPointerCapture"));
    assert.equal(
      shouldBeginPlayhtmlMoveForeground(
        resizeButtonTarget() as unknown as EventTarget,
      ),
      false,
    );
  });

  it("27. resize pointerdown does not initiate canvas pan", () => {
    const handle = readSrc("src/components/canvas/object-resize-handle.tsx");
    assert.ok(handle.includes("setCreateUiBlocksPan(true)"));
    const target = resizeButtonTarget();
    assert.equal(
      isInteractiveCanvasTarget(target as unknown as EventTarget),
      true,
    );
    assert.equal(
      isCanvasPanHitTarget(target as unknown as EventTarget),
      false,
    );
    assert.equal(
      shouldTrackCanvasPan({
        isPrimary: true,
        button: 0,
        createUiBlocksPan: false,
        overlayInteractive: null,
        target: target as unknown as EventTarget,
      }),
      false,
    );
    assert.equal(
      shouldTrackCanvasPan({
        isPrimary: true,
        button: 0,
        createUiBlocksPan: true,
        overlayInteractive: null,
        target: {
          closest(sel: string) {
            if (sel.includes("canvas-empty-hit")) return this;
            return null;
          },
        } as unknown as EventTarget,
      }),
      false,
    );
  });

  it("28. pointerup commits the final resize delta", () => {
    const handle = readSrc("src/components/canvas/object-resize-handle.tsx");
    assert.ok(handle.includes("finishObjectScaleResize"));
    assert.ok(handle.includes("onResizeRef.current(nextScale)"));
  });

  it("29. pointercancel exits safely", () => {
    const handle = readSrc("src/components/canvas/object-resize-handle.tsx");
    assert.ok(handle.includes("pointercancel"));
    assert.ok(handle.includes("setCreateUiBlocksPan(false)"));
  });

  it("30. Safari-style pointer values remain accepted", () => {
    const handle = readSrc("src/components/canvas/object-resize-handle.tsx");
    assert.ok(handle.includes("isUsableCanvasPointer"));
    assert.equal(isUsableCanvasPointer({ button: -1 }), true);
    assert.equal(isUsableCanvasPointer({}), true);
    assert.equal(isUsableCanvasPointer({ isPrimary: false }), false);
    assert.equal(handle.includes("navigator.userAgent"), false);
  });

  it("31. clicking immediately outside resized object interacts with canvas", () => {
    const host = drawingVisibleRect({
      left: 20,
      top: 20,
      width: 10,
      height: 8,
    });
    const outside = pointJustOutsideCanvasObject(host, "right");
    assert.equal(pointInCanvasObjectRect(outside, host), false);
    assert.equal(
      canvasObjectOverlapHit({
        object: host,
        other: { left: 80, top: 80, width: 5, height: 5 },
        point: outside,
      }),
      "empty",
    );
  });

  it("32. nearby object remains independently draggable", () => {
    const resized = drawingVisibleRect({
      left: 10,
      top: 10,
      width: 8,
      height: 6,
    });
    const neighbour = drawingVisibleRect({
      left: 18.5,
      top: 10,
      width: 6,
      height: 6,
    });
    const onNeighbour = { x: 20, y: 13 };
    assert.equal(
      canvasObjectOverlapHit({
        object: resized,
        other: neighbour,
        point: onNeighbour,
      }),
      "other",
    );
    const handle = objectResizeHandleRect(resized);
    assert.ok(handle.width <= 28);
    assert.ok(handle.left >= resized.left);
    assert.ok(handle.top >= resized.top);
  });
});

describe("TEXT/DRAW resize chrome", () => {
  it("handle uses Lab L-corner language and nwse-resize", () => {
    const handle = readSrc("src/components/canvas/object-resize-handle.tsx");
    assert.ok(handle.includes("cursor-nwse-resize"));
    assert.ok(handle.includes("border-r border-b border-neutral-400"));
    assert.ok(handle.includes("h-2 w-2"));
    assert.ok(handle.includes("h-7 w-7"));
    assert.equal(handle.includes("use-interactive-control-protection"), false);
    assert.equal(handle.includes("navigator.userAgent"), false);
  });

  it("host lookup uses attribute selectors, not #4663- ids", () => {
    const text = readSrc("src/components/social/ephemeral-text-object.tsx");
    const drawing = readSrc(
      "src/components/social/ephemeral-drawing-object.tsx",
    );
    const handle = readSrc("src/components/canvas/object-resize-handle.tsx");
    assert.ok(text.includes('hostSelector={`[data-4663-ephemeral-text="${text.textId}"]`}'));
    assert.ok(
      drawing.includes(
        'hostSelector={`[data-4663-ephemeral-drawing="${drawing.drawingId}"]`}',
      ),
    );
    assert.ok(text.includes("objectId={text.textId}"));
    assert.ok(drawing.includes("objectId={drawing.drawingId}"));
    assert.equal(text.includes("hostSelector={`#"), false);
    assert.equal(drawing.includes("hostSelector={`#"), false);
    assert.ok(handle.includes("the id starts with a digit"));
  });

  it("owner-only TEXT handle; remote has no resize control", () => {
    const object = readSrc("src/components/social/ephemeral-text-object.tsx");
    assert.ok(object.includes("data-4663-ephemeral-text-resize"));
    assert.ok(object.includes("{isOwner ? ("));
    assert.ok(object.includes("ObjectResizeHandle"));
  });

  it("TEXT delete and resize occupy opposite corners", () => {
    const object = readSrc("src/components/social/ephemeral-text-object.tsx");
    assert.ok(object.includes("data-4663-ephemeral-text-delete"));
    assert.ok(object.includes("absolute -top-5 left-0"));
    assert.ok(object.includes("whitespace-nowrap"));
    assert.equal(object.includes("mt-0.5 touch-manipulation"), false);
    assert.ok(object.includes('positionClassName="-right-5 -bottom-5"'));
    assert.ok(object.includes('dataAttr="data-4663-ephemeral-text-resize"'));
  });

  it("display height follows aspect, not a distorted independent height%", () => {
    const drawing = makeDrawing({ scale: 2 });
    const display = drawingDisplaySize(drawing);
    assert.ok(
      Math.abs(
        display.heightPct -
          drawingHeightPctFromAspect(display.widthPct, drawing.aspectRatio),
      ) < 1e-9,
    );
    const object = readSrc("src/components/social/ephemeral-drawing-object.tsx");
    assert.equal(object.includes("height: `${drawing.heightPct}%`"), false);
  });

  it("upsert after resize keeps other objects untouched", () => {
    const a = makeDrawing();
    const other = createEphemeralDrawingObject({
      drawingId: "9c9e6679-7425-40de-944b-e07fc1f90ae9",
      ownerSessionId: OWNER_B,
      strokes: [stroke],
      leftPct: 70,
      topPct: 70,
      widthPct: 4,
      heightPct: 3,
      aspectRatio: 1.5,
      now: () => new Date("2026-08-18T00:00:00.000Z"),
    });
    assert.equal(other.ok, true);
    if (!other.ok) return;
    let data = upsertEphemeralDrawing({ drawings: [] }, a);
    data = upsertEphemeralDrawing(data, other.drawing);
    data = resizeEphemeralDrawing(data, a.drawingId, 2);
    assert.equal(data.drawings.find((d) => d.drawingId === a.drawingId)?.scale, 2);
    assert.equal(
      data.drawings.find((d) => d.drawingId === other.drawing.drawingId)?.scale,
      1,
    );
    const textA = makeText();
    let texts = upsertEphemeralText({ texts: [] }, textA);
    texts = resizeEphemeralText(texts, textA.textId, 2);
    assert.equal(texts.texts[0]?.fontScale, 2);
  });
});

describe("TEXT/DRAW multi-object isolation", () => {
  const TEXT_B = "8c9e6679-7425-40de-944b-e07fc1f90ae8";
  const TEXT_C = "9c9e6679-7425-40de-944b-e07fc1f90ae9";
  const DRAW_B = "ac9e6679-7425-40de-944b-e07fc1f90aea";
  const DRAW_C = "bc9e6679-7425-40de-944b-e07fc1f90aeb";

  function textAt(id: string, leftPct: number, topPct: number) {
    const created = createEphemeralTextObject({
      body: id.slice(0, 8),
      ownerSessionId: OWNER_A,
      leftPct,
      topPct,
      randomUUID: () => id,
      now: () => new Date("2026-08-18T00:00:00.000Z"),
    });
    assert.equal(created.ok, true);
    if (!created.ok) throw new Error("expected text");
    return created.text;
  }

  function drawingAt(
    id: string,
    leftPct: number,
    topPct: number,
    strokes = [stroke],
  ) {
    const created = createEphemeralDrawingObject({
      drawingId: id,
      ownerSessionId: OWNER_A,
      strokes,
      leftPct,
      topPct,
      widthPct: 4,
      heightPct: 3,
      aspectRatio: 1.5,
      now: () => new Date("2026-08-18T00:00:00.000Z"),
    });
    assert.equal(created.ok, true);
    if (!created.ok) throw new Error("expected drawing");
    return created.drawing;
  }

  it("TEXT A/B/C resize and move stay isolated; order is preserved", () => {
    const a = textAt(TEXT_A, 10, 10);
    const b = textAt(TEXT_B, 30, 12);
    const c = textAt(TEXT_C, 50, 14);
    let data = upsertEphemeralText(
      upsertEphemeralText(upsertEphemeralText({ texts: [] }, a), b),
      c,
    );
    const ids = () => data.texts.map((t) => t.textId);

    data = resizeEphemeralText(data, a.textId, 2);
    assert.deepEqual(ids(), [TEXT_A, TEXT_B, TEXT_C]);
    assert.equal(data.texts[0]?.fontScale, 2);
    assert.equal(data.texts[1]?.fontScale, 1);
    assert.equal(data.texts[2]?.fontScale, 1);

    data = resizeEphemeralText(data, b.textId, 1.5);
    assert.equal(data.texts[0]?.fontScale, 2);
    assert.equal(data.texts[1]?.fontScale, 1.5);
    assert.equal(data.texts[2]?.fontScale, 1);

    data = resizeEphemeralText(data, c.textId, 0.8);
    assert.equal(data.texts[0]?.fontScale, 2);
    assert.equal(data.texts[1]?.fontScale, 1.5);
    assert.equal(data.texts[2]?.fontScale, 0.8);

    // Move is origin-only; sibling scales stay put.
    data = upsertEphemeralText(data, { ...data.texts[0]!, leftPct: 18, topPct: 22 });
    assert.equal(data.texts[0]?.leftPct, 18);
    assert.equal(data.texts[1]?.leftPct, 30);
    assert.equal(data.texts[2]?.leftPct, 50);
    assert.equal(data.texts[1]?.fontScale, 1.5);

    data = upsertEphemeralText(data, { ...data.texts[1]!, leftPct: 36, topPct: 40 });
    assert.equal(data.texts[0]?.leftPct, 18);
    assert.equal(data.texts[1]?.leftPct, 36);
    assert.equal(data.texts[2]?.leftPct, 50);

    // Resize A after interacting with B still changes only A.
    data = resizeEphemeralText(data, a.textId, 2.5);
    assert.equal(data.texts[0]?.fontScale, 2.5);
    assert.equal(data.texts[1]?.fontScale, 1.5);
    assert.equal(data.texts[1]?.leftPct, 36);

    // Movement after resize / resize after movement.
    data = upsertEphemeralText(data, { ...data.texts[0]!, leftPct: 12, topPct: 16 });
    data = resizeEphemeralText(data, a.textId, 1.2);
    assert.equal(data.texts[0]?.leftPct, 12);
    assert.equal(data.texts[0]?.fontScale, 1.2);
    assert.equal(data.texts[1]?.fontScale, 1.5);
    assert.deepEqual(ids(), [TEXT_A, TEXT_B, TEXT_C]);
  });

  it("DRAW A/B/C resize and move stay isolated; strokes/AABB stay with owner", () => {
    const strokeB = {
      colour: "#171717" as const,
      points: [
        { x: 0.1, y: 0.9 },
        { x: 0.9, y: 0.1 },
      ],
    };
    const a = drawingAt(DRAW_A, 12, 20);
    const b = drawingAt(DRAW_B, 28, 22, [strokeB]);
    const c = drawingAt(DRAW_C, 44, 24);
    let data = upsertEphemeralDrawing(
      upsertEphemeralDrawing(upsertEphemeralDrawing({ drawings: [] }, a), b),
      c,
    );
    const ids = () => data.drawings.map((d) => d.drawingId);

    data = resizeEphemeralDrawing(data, a.drawingId, 2);
    assert.deepEqual(ids(), [DRAW_A, DRAW_B, DRAW_C]);
    assert.equal(data.drawings[0]?.scale, 2);
    assert.equal(data.drawings[1]?.scale, 1);
    assert.equal(data.drawings[2]?.scale, 1);
    assert.deepEqual(data.drawings[1]?.strokes, [strokeB]);

    data = resizeEphemeralDrawing(data, b.drawingId, 1.4);
    assert.equal(data.drawings[0]?.scale, 2);
    assert.equal(data.drawings[1]?.scale, 1.4);
    assert.deepEqual(data.drawings[0]?.strokes, [stroke]);

    data = upsertEphemeralDrawing(data, {
      ...data.drawings[0]!,
      leftPct: 15,
      topPct: 30,
    });
    assert.equal(data.drawings[0]?.leftPct, 15);
    assert.equal(data.drawings[1]?.leftPct, 28);
    assert.equal(data.drawings[1]?.scale, 1.4);

    data = upsertEphemeralDrawing(data, {
      ...data.drawings[1]!,
      leftPct: 33,
      topPct: 35,
    });
    assert.equal(data.drawings[0]?.leftPct, 15);
    assert.equal(data.drawings[1]?.leftPct, 33);
    assert.equal(data.drawings[0]?.scale, 2);

    const displayA = drawingDisplaySize(data.drawings[0]!);
    const displayB = drawingDisplaySize(data.drawings[1]!);
    assert.ok(displayA.widthPct !== displayB.widthPct);
    const hostA = drawingVisibleRect({
      left: data.drawings[0]!.leftPct,
      top: data.drawings[0]!.topPct,
      width: displayA.widthPct,
      height: displayA.heightPct,
    });
    const hostB = drawingVisibleRect({
      left: data.drawings[1]!.leftPct,
      top: data.drawings[1]!.topPct,
      width: displayB.widthPct,
      height: displayB.heightPct,
    });
    assert.equal(hostMatchesVisible(hostA, hostA), true);
    assert.equal(hostMatchesVisible(hostB, hostB), true);
  });

  it("mixed TEXT/DRAW alternating ops never cross-mutate", () => {
    const textA = textAt(TEXT_A, 10, 10);
    const drawA = drawingAt(DRAW_A, 20, 20);
    const textB = textAt(TEXT_B, 40, 10);
    const drawB = drawingAt(DRAW_B, 50, 20);
    let texts = upsertEphemeralText(upsertEphemeralText({ texts: [] }, textA), textB);
    let drawings = upsertEphemeralDrawing(
      upsertEphemeralDrawing({ drawings: [] }, drawA),
      drawB,
    );

    texts = resizeEphemeralText(texts, textA.textId, 2);
    drawings = upsertEphemeralDrawing(drawings, {
      ...drawings.drawings[0]!,
      leftPct: 22,
    });
    texts = upsertEphemeralText(texts, { ...texts.texts[1]!, leftPct: 44 });
    drawings = resizeEphemeralDrawing(drawings, drawB.drawingId, 1.8);
    texts = resizeEphemeralText(texts, textB.textId, 1.3);
    drawings = upsertEphemeralDrawing(drawings, {
      ...drawings.drawings[1]!,
      leftPct: 55,
    });
    texts = upsertEphemeralText(texts, { ...texts.texts[0]!, leftPct: 11 });
    drawings = resizeEphemeralDrawing(drawings, drawA.drawingId, 1.1);

    assert.equal(texts.texts.find((t) => t.textId === TEXT_A)?.fontScale, 2);
    assert.equal(texts.texts.find((t) => t.textId === TEXT_A)?.leftPct, 11);
    assert.equal(texts.texts.find((t) => t.textId === TEXT_B)?.fontScale, 1.3);
    assert.equal(texts.texts.find((t) => t.textId === TEXT_B)?.leftPct, 44);
    assert.equal(drawings.drawings.find((d) => d.drawingId === DRAW_A)?.scale, 1.1);
    assert.equal(drawings.drawings.find((d) => d.drawingId === DRAW_A)?.leftPct, 22);
    assert.equal(drawings.drawings.find((d) => d.drawingId === DRAW_B)?.scale, 1.8);
    assert.equal(drawings.drawings.find((d) => d.drawingId === DRAW_B)?.leftPct, 55);
  });

  it("rapid object switch and pointercancel keep sessions bound to initiator", () => {
    const sessionA = beginObjectScaleResize({
      pointerId: 11,
      objectId: TEXT_A,
      clientX: 10,
      clientY: 10,
      scale: 1,
      widthPx: 80,
      heightPx: 40,
      minScale: 0.5,
      maxScale: 4,
    });
    assert.equal(
      moveObjectScaleResize(sessionA, {
        pointerId: 11,
        objectId: TEXT_B,
        deltaX: 40,
        deltaY: 20,
      }),
      null,
    );
    const cancelled = finishObjectScaleResize(sessionA, {
      type: "pointercancel",
      pointerId: 11,
      objectId: TEXT_A,
      deltaX: 0,
      deltaY: 0,
    });
    assert.equal(cancelled, 1);

    const sessionB = beginObjectScaleResize({
      pointerId: 12,
      objectId: TEXT_B,
      clientX: 40,
      clientY: 40,
      scale: 1,
      widthPx: 80,
      heightPx: 40,
      minScale: 0.5,
      maxScale: 4,
    });
    const movedB = moveObjectScaleResize(sessionB, {
      pointerId: 12,
      objectId: TEXT_B,
      deltaX: 80,
      deltaY: 40,
    });
    assert.equal(movedB?.objectId, TEXT_B);
    assert.equal(movedB?.scale, 2);
    assert.equal(sessionA.objectId, TEXT_A);
    assert.equal(sessionA.scale, 1);
  });

  it("PlayHTML ids, keys, and resize handles are unique per instance", () => {
    assert.notEqual(playhtmlTextElementId(TEXT_A), playhtmlTextElementId(TEXT_B));
    assert.notEqual(
      playhtmlDrawingElementId(DRAW_A),
      playhtmlDrawingElementId(DRAW_B),
    );
    const text = readSrc("src/components/social/ephemeral-text-object.tsx");
    const drawing = readSrc("src/components/social/ephemeral-drawing-object.tsx");
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    const handle = readSrc("src/components/canvas/object-resize-handle.tsx");
    const move = readSrc("src/components/canvas/use-playhtml-move-foreground.ts");
    assert.ok(text.includes("key={text.textId}") === false);
    assert.ok(layer.includes("key={text.textId}"));
    assert.ok(layer.includes("key={drawing.drawingId}"));
    assert.ok(layer.includes("pageDataRef.current = normalized"));
    assert.ok(layer.includes("drawingsPageDataRef.current = normalized"));
    assert.ok(handle.includes("objectId: objectIdRef.current"));
    assert.ok(handle.includes("setPointerCapture"));
    assert.ok(handle.includes("releasePointerCapture"));
    assert.ok(handle.includes("pointercancel"));
    assert.ok(move.includes("event.currentTarget"));
    assert.equal(move.includes("querySelector("), false);
    assert.equal(move.includes("setPointerCapture"), false);
    assert.ok(text.includes("data-4663-ephemeral-text={text.textId}"));
    assert.ok(drawing.includes("data-4663-ephemeral-drawing={drawing.drawingId}"));
    const nearby = drawingVisibleRect({ left: 10, top: 10, width: 8, height: 6 });
    const neighbour = drawingVisibleRect({
      left: 18.5,
      top: 10,
      width: 6,
      height: 6,
    });
    assert.equal(
      canvasObjectOverlapHit({
        object: nearby,
        other: neighbour,
        point: { x: 20, y: 13 },
      }),
      "other",
    );
  });
});
