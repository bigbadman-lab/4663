/**
 * Control palette slot definitions (actions wired in later stages).
 */

export type ControlPaletteActionId =
  | "summon"
  | "last-event"
  | "clear"
  | "reset"
  | "about";

export type ControlPaletteItem = {
  id: ControlPaletteActionId;
  label: string;
  /** Solid CSS color for the temporary placeholder glyph. */
  placeholderColor: string;
  /** Placeholder geometry — replace later with an image asset. */
  placeholderShape: "circle" | "square" | "triangle" | "diamond" | "plus";
};

export const CONTROL_PALETTE_ITEMS: readonly ControlPaletteItem[] = [
  {
    id: "summon",
    label: "Summon",
    placeholderColor: "#3B82F6",
    placeholderShape: "circle",
  },
  {
    id: "last-event",
    label: "Last event",
    placeholderColor: "#F59E0B",
    placeholderShape: "square",
  },
  {
    id: "clear",
    label: "Clear",
    placeholderColor: "#EF4444",
    placeholderShape: "triangle",
  },
  {
    id: "reset",
    label: "Reset",
    placeholderColor: "#64748B",
    placeholderShape: "diamond",
  },
  {
    id: "about",
    label: "About",
    placeholderColor: "#0D9488",
    placeholderShape: "plus",
  },
] as const;
