/**
 * Shared DRAW / BRUSH colour palette.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_DRAWING_COLOUR,
  DRAW_COLOURS,
  DRAWING_COLOUR_PALETTE,
  LEGACY_DRAWING_COLOURS,
  isDrawingColour,
} from "@/lib/social/draw-colours";
import {
  BRUSH_COLOUR_PALETTE,
  BRUSH_COLOURS,
  DEFAULT_BRUSH_COLOUR,
  createEphemeralBrushDocument,
  normalizeBrushStroke,
} from "@/lib/social/ephemeral-brush";
import {
  createEphemeralDrawingObject,
  normalizeEphemeralDrawingObject,
} from "@/lib/social/ephemeral-drawing";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const OWNER = "550e8400-e29b-41d4-a716-446655440000";
const DRAW_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const DOC_ID = "33333333-3333-4333-8333-333333333333";

const CORE_ELEVEN = [
  { id: "bone", value: "#F3F0E7", label: "BONE" },
  { id: "charcoal", value: "#171717", label: "CHARCOAL" },
  { id: "red", value: "#E11D48", label: "RED" },
  { id: "orange", value: "#EA580C", label: "ORANGE" },
  { id: "yellow", value: "#F59E0B", label: "YELLOW" },
  { id: "acid", value: "#8FAE00", label: "ACID" },
  { id: "green", value: "#15803D", label: "GREEN" },
  { id: "cyan", value: "#0D9488", label: "CYAN" },
  { id: "blue", value: "#3B82F6", label: "BLUE" },
  { id: "purple", value: "#7C3AED", label: "PURPLE" },
  { id: "pink", value: "#EC4899", label: "PINK" },
] as const;

const BRIGHT_NINE = [
  { id: "neon", value: "#39FF14", label: "NEON" },
  { id: "electric", value: "#00E5FF", label: "ELECTRIC" },
  { id: "magenta", value: "#FF00A8", label: "MAGENTA" },
  { id: "violet", value: "#9D00FF", label: "VIOLET" },
  { id: "coral", value: "#FF5A5F", label: "CORAL" },
  { id: "tangerine", value: "#FF7A00", label: "TANGERINE" },
  { id: "lemon", value: "#FFF200", label: "LEMON" },
  { id: "sky", value: "#38BDF8", label: "SKY" },
  { id: "mint", value: "#00F5A0", label: "MINT" },
] as const;

describe("shared DRAW / BRUSH colour palette", () => {
  it("1. exactly 20 colours", () => {
    assert.equal(DRAW_COLOURS.length, 20);
    assert.equal(DRAWING_COLOUR_PALETTE.length, 20);
    assert.deepEqual(
      DRAWING_COLOUR_PALETTE,
      DRAW_COLOURS.map((c) => c.value),
    );
    assert.ok(DRAWING_COLOUR_PALETTE.every((c) => /^#[0-9A-F]{6}$/.test(c)));
  });

  it("2. all original 6 legacy colours remain", () => {
    for (const hex of LEGACY_DRAWING_COLOURS) {
      assert.equal(isDrawingColour(hex), true, hex);
      assert.ok(DRAWING_COLOUR_PALETTE.includes(hex), hex);
    }
  });

  it("3. all current 11 colours remain unchanged", () => {
    assert.deepEqual(DRAW_COLOURS.slice(0, 11), [...CORE_ELEVEN]);
  });

  it("4. all 9 new colours exist with their exact values", () => {
    assert.deepEqual(DRAW_COLOURS.slice(11), [...BRIGHT_NINE]);
  });

  it("5. no duplicate IDs", () => {
    const ids = DRAW_COLOURS.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("6. no duplicate hex values", () => {
    const values = DRAW_COLOURS.map((c) => c.value);
    assert.equal(new Set(values).size, values.length);
  });

  it("7. CHARCOAL remains the default", () => {
    assert.equal(DEFAULT_DRAWING_COLOUR, "#171717");
    assert.equal(DEFAULT_BRUSH_COLOUR, "#171717");
  });

  it("8. OBJECT consumes the shared 20-colour palette", () => {
    const editor = readSrc("src/components/social/drawing-session-editor.tsx");
    assert.ok(editor.includes("DRAW_COLOURS"));
    assert.ok(editor.includes("DRAW_COLOURS.map"));
    assert.ok(editor.includes("data-4663-drawing-colours"));
    assert.ok(editor.includes("data-4663-drawing-colour={swatch.value}"));
    assert.ok(editor.includes("DEFAULT_DRAWING_COLOUR"));
    assert.equal(DRAW_COLOURS.length, 20);
  });

  it("9. BRUSH consumes the shared 20-colour palette", () => {
    const overlay = readSrc("src/components/social/brush-session-overlay.tsx");
    assert.ok(overlay.includes("BRUSH_COLOURS"));
    assert.ok(overlay.includes("BRUSH_COLOURS.map"));
    assert.ok(overlay.includes("data-4663-brush-colours"));
    assert.ok(overlay.includes("data-4663-brush-colour={swatch.value}"));
    assert.ok(overlay.includes("DEFAULT_BRUSH_COLOUR"));
    assert.equal(BRUSH_COLOURS, DRAW_COLOURS);
    assert.deepEqual(BRUSH_COLOUR_PALETTE, DRAWING_COLOUR_PALETTE);
  });

  it("10. OBJECT and BRUSH ordering remains identical", () => {
    assert.deepEqual(
      BRUSH_COLOURS.map((c) => c.value),
      DRAW_COLOURS.map((c) => c.value),
    );
    assert.deepEqual(BRUSH_COLOUR_PALETTE, DRAWING_COLOUR_PALETTE);
    assert.equal(DEFAULT_BRUSH_COLOUR, DEFAULT_DRAWING_COLOUR);
  });

  it("11. newly added bright colours validate through isDrawingColour", () => {
    for (const colour of BRIGHT_NINE) {
      assert.equal(isDrawingColour(colour.value), true, colour.id);
    }
  });

  it("12. unknown arbitrary hexes remain rejected", () => {
    assert.equal(isDrawingColour("#FF00FF"), false);
    assert.equal(isDrawingColour("#000000"), false);
    assert.equal(isDrawingColour("#FFFFFF"), false);
    assert.equal(isDrawingColour("neon"), false);
  });

  it("selecting a newly added OBJECT colour applies it to the created object", () => {
    const neon = DRAW_COLOURS.find((c) => c.id === "neon")!.value;
    const created = createEphemeralDrawingObject({
      drawingId: DRAW_ID,
      ownerSessionId: OWNER,
      strokes: [
        {
          colour: neon,
          points: [
            { x: 0.1, y: 0.1 },
            { x: 0.4, y: 0.4 },
          ],
        },
      ],
      leftPct: 40,
      topPct: 50,
      widthPct: 22,
      heightPct: 22,
      aspectRatio: 1.6,
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.drawing.strokes[0]?.colour, neon);
  });

  it("selecting a newly added BRUSH colour applies it to new brush strokes", () => {
    const electric = DRAW_COLOURS.find((c) => c.id === "electric")!.value;
    const stroke = normalizeBrushStroke({
      colour: electric,
      points: [
        { x: 12, y: 20 },
        { x: 18, y: 24 },
      ],
    });
    assert.ok(stroke);
    assert.equal(stroke!.colour, electric);

    const created = createEphemeralBrushDocument({
      documentId: DOC_ID,
      ownerSessionId: OWNER,
      strokes: [stroke!],
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.document.strokes[0]?.colour, electric);
  });

  it("existing persisted colour values remain valid/renderable", () => {
    for (const hex of LEGACY_DRAWING_COLOURS) {
      const drawing = normalizeEphemeralDrawingObject({
        drawingId: DRAW_ID,
        ownerSessionId: OWNER,
        strokes: [
          {
            colour: hex,
            points: [
              { x: 0.1, y: 0.1 },
              { x: 0.2, y: 0.2 },
            ],
          },
        ],
        leftPct: 40,
        topPct: 50,
        widthPct: 22,
        heightPct: 22,
        aspectRatio: 1.6,
        createdAt: "2026-08-13T00:00:00.000Z",
      });
      assert.ok(drawing, hex);
      assert.equal(drawing!.strokes[0]?.colour, hex);

      const brush = normalizeBrushStroke({
        colour: hex,
        points: [
          { x: 10, y: 10 },
          { x: 20, y: 20 },
        ],
      });
      assert.ok(brush, hex);
      assert.equal(brush!.colour, hex);
    }
  });

  it("BRUSH DONE/publish semantics remain unchanged", () => {
    const overlay = readSrc("src/components/social/brush-session-overlay.tsx");
    const doneFn = overlay.slice(
      overlay.indexOf("const done = () => {"),
      overlay.indexOf("useEffect(() => {"),
    );
    assert.ok(doneFn.includes("resolveBrushDoneIntent(finalStrokes)"));
    assert.equal(doneFn.includes("onCancel()"), false);
    assert.ok(doneFn.includes("onDone(finalStrokes)"));
    assert.equal(overlay.includes("setColour(swatch.value)"), true);
    assert.equal(overlay.includes("strokesRef.current.map"), false);
  });

  it("colour rows wrap instead of overflowing on mobile", () => {
    const editor = readSrc("src/components/social/drawing-session-editor.tsx");
    const overlay = readSrc("src/components/social/brush-session-overlay.tsx");
    for (const src of [editor, overlay]) {
      assert.ok(src.includes("flex-wrap"));
      assert.ok(src.includes("overflow-x-hidden"));
      assert.ok(src.includes("max-w-[min(calc(100vw-1.5rem),12.5rem)]"));
      assert.ok(src.includes("h-3.5 w-3.5"));
      assert.ok(src.includes("shrink-0"));
      assert.ok(src.includes("gap-x-1"));
      assert.ok(src.includes("gap-y-1.5"));
    }
  });
});
