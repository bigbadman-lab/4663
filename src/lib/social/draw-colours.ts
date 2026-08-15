/**
 * Shared DRAW / BRUSH colour palette.
 * Stored stroke colour is the hex `value`; ids/labels are UI-only.
 * Expanding this list must keep every previously persisted hex valid.
 */

export const DRAW_COLOURS = [
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

export type DrawColourId = (typeof DRAW_COLOURS)[number]["id"];

export type DrawingColour = (typeof DRAW_COLOURS)[number]["value"];

/** Hex values in display order — OBJECT and BRUSH both consume this. */
export const DRAWING_COLOUR_PALETTE: readonly DrawingColour[] =
  DRAW_COLOURS.map((c) => c.value);

/**
 * Default selected swatch. Charcoal was palette[0] before the expansion;
 * keep it as the starting colour so new sessions do not begin on bone/white.
 */
export const DEFAULT_DRAWING_COLOUR: DrawingColour = "#171717";

/** Hex values that existed before the shared-palette expansion. */
export const LEGACY_DRAWING_COLOURS = [
  "#171717",
  "#8FAE00",
  "#3B82F6",
  "#E11D48",
  "#F59E0B",
  "#0D9488",
] as const satisfies readonly DrawingColour[];

export function isDrawingColour(value: unknown): value is DrawingColour {
  return (
    typeof value === "string" &&
    (DRAWING_COLOUR_PALETTE as readonly string[]).includes(value)
  );
}
