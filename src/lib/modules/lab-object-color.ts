/**
 * Shared Lab object colour vocabulary (NOTE, CHECKLIST, later visual modules).
 * Instance-level, not ModuleDefinition. Not a theme system.
 */

export const LAB_OBJECT_COLOR_IDS = [
  "bone",
  "yellow",
  "blue",
  "green",
  "pink",
  "purple",
  "orange",
  "dark",
] as const;

export type LabObjectColor = (typeof LAB_OBJECT_COLOR_IDS)[number];

/** Neutral paper default — canvas-tone bone, closest to the current Lab stamp. */
export const DEFAULT_LAB_OBJECT_COLOR: LabObjectColor = "bone";

export type LabObjectColorVisual = {
  background: string;
  foreground: string;
  border: string;
  muted: string;
};

/**
 * Paper surfaces mixed from existing 4663 tokens:
 * canvas-tone bone/fg/muted, DRAW charcoal / yellow / blue / acid / pink /
 * purple / orange. Saturated DRAW hexes are strokes — too loud as fills —
 * so coloured entries are paper tints of those hues.
 */
export const LAB_OBJECT_COLORS: Record<LabObjectColor, LabObjectColorVisual> = {
  bone: {
    background: "#F3F0E7",
    foreground: "#171717",
    border: "#D4CFC2",
    muted: "#8A8578",
  },
  yellow: {
    background: "#F3E4B0",
    foreground: "#171717",
    border: "#E0CC86",
    muted: "#7A6E48",
  },
  blue: {
    background: "#D6E3F5",
    foreground: "#171717",
    border: "#B4C7E4",
    muted: "#4E6280",
  },
  green: {
    background: "#E4EBC0",
    foreground: "#171717",
    border: "#C5D18E",
    muted: "#5F6B3A",
  },
  pink: {
    background: "#F2D5E4",
    foreground: "#171717",
    border: "#DEB0C8",
    muted: "#7A4E64",
  },
  purple: {
    background: "#E3D6F1",
    foreground: "#171717",
    border: "#C9B4E0",
    muted: "#5E4A76",
  },
  orange: {
    background: "#F2D6C0",
    foreground: "#171717",
    border: "#E0B894",
    muted: "#7A5640",
  },
  dark: {
    background: "#171717",
    foreground: "#F3F0E7",
    border: "#3F3F3F",
    muted: "#A3A3A3",
  },
};

export function isLabObjectColor(value: unknown): value is LabObjectColor {
  return (
    typeof value === "string" &&
    (LAB_OBJECT_COLOR_IDS as readonly string[]).includes(value)
  );
}

export function normalizeLabObjectColor(value: unknown): LabObjectColor {
  return isLabObjectColor(value) ? value : DEFAULT_LAB_OBJECT_COLOR;
}

export function labObjectColorVisual(
  value: unknown,
): LabObjectColorVisual {
  return LAB_OBJECT_COLORS[normalizeLabObjectColor(value)];
}
