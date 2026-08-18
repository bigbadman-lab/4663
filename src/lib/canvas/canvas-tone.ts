/**
 * Social 8A.2 — local-only canvas tone preference (presentation, not shared state).
 * All tones are light/paper-like (no dark mode).
 */

export const CANVAS_TONE_STORAGE_KEY = "4663_canvas_tone" as const;

export const CANVAS_TONES = ["white", "bone", "mist", "slate"] as const;

export type CanvasTone = (typeof CANVAS_TONES)[number];

export const DEFAULT_CANVAS_TONE: CanvasTone = "white";

export const CANVAS_TONE_LABELS: Record<CanvasTone, string> = {
  white: "WHITE",
  bone: "BONE",
  mist: "MIST",
  slate: "SLATE",
};

export type CanvasToneColor = {
  bg: string;
  fg: string;
  muted: string;
  border: string;
};

/** Curated light paper colours — presentation only. */
export const CANVAS_TONE_COLORS: Record<CanvasTone, CanvasToneColor> = {
  white: { bg: "#FFFFFF", fg: "#171717", muted: "#A3A3A3", border: "#D4D4D4" },
  bone: { bg: "#F3F0E7", fg: "#171717", muted: "#8A8578", border: "#D4CFC2" },
  mist: { bg: "#E8E8E4", fg: "#171717", muted: "#7A7A74", border: "#C9C9C4" },
  slate: { bg: "#D3D5D2", fg: "#171717", muted: "#6B6F6C", border: "#B4B7B3" },
};

export function canvasToneTitle(tone: CanvasTone): string {
  const label = CANVAS_TONE_LABELS[tone];
  return `${label.slice(0, 1)}${label.slice(1).toLowerCase()}`;
}

export function isCanvasTone(value: unknown): value is CanvasTone {
  return (
    typeof value === "string" &&
    (CANVAS_TONES as readonly string[]).includes(value)
  );
}

/**
 * Accept only current tones. Obsolete values (e.g. "graphite") → WHITE.
 */
export function normalizeCanvasTone(value: unknown): CanvasTone {
  return isCanvasTone(value) ? value : DEFAULT_CANVAS_TONE;
}

export function readCanvasTone(
  storage: Pick<Storage, "getItem"> | null | undefined = typeof window !==
  "undefined"
    ? window.localStorage
    : null,
): CanvasTone {
  if (!storage) return DEFAULT_CANVAS_TONE;
  try {
    return normalizeCanvasTone(storage.getItem(CANVAS_TONE_STORAGE_KEY));
  } catch {
    return DEFAULT_CANVAS_TONE;
  }
}

export function writeCanvasTone(
  tone: CanvasTone,
  storage: Pick<Storage, "setItem"> | null | undefined = typeof window !==
  "undefined"
    ? window.localStorage
    : null,
): void {
  if (!storage) return;
  const next = normalizeCanvasTone(tone);
  try {
    storage.setItem(CANVAS_TONE_STORAGE_KEY, next);
  } catch {
    // Quota / private mode — preference stays in-memory only.
  }
}

/** Apply tone to documentElement for CSS + FOUC script alignment. */
export function applyCanvasToneToDocument(
  tone: CanvasTone,
  doc: Document = document,
): void {
  doc.documentElement.setAttribute("data-canvas-tone", normalizeCanvasTone(tone));
}

/**
 * Inline boot script (layout) — restore tone before paint when possible.
 * Keep in sync with CANVAS_TONE_STORAGE_KEY / accepted values.
 * Unknown / obsolete values (incl. graphite) → white.
 */
export const CANVAS_TONE_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(CANVAS_TONE_STORAGE_KEY)};var v=localStorage.getItem(k);var ok={white:1,bone:1,mist:1,slate:1};document.documentElement.setAttribute("data-canvas-tone",ok[v]?v:"white");}catch(e){document.documentElement.setAttribute("data-canvas-tone","white");}})();`;
