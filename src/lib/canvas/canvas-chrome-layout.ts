/**
 * Viewport chrome layout — compact vs genuine desktop.
 * CSS applies the same rule via the `desktop-chrome:` Tailwind variant.
 * Not a device/UA detector; not used to drive camera scale.
 */

export const DESKTOP_CHROME_MIN_WIDTH_PX = 1280 as const;

export const DESKTOP_CHROME_MEDIA_QUERY =
  "(min-width: 1280px) and (hover: hover) and (pointer: fine)" as const;

/** Tailwind variant name registered in globals.css. */
export const DESKTOP_CHROME_VARIANT = "desktop-chrome" as const;

/** Compact (phone + tablet) dock lift above the viewport bottom. */
export const COMPACT_DOCK_BOTTOM_CLEARANCE = "5.75rem" as const;

/** Desktop dock lift — only when DESKTOP_CHROME_MEDIA_QUERY matches. */
export const DESKTOP_DOCK_BOTTOM_CLEARANCE = "3.75rem" as const;

/**
 * Compact presence / UTC clock bottom inset (`bottom-5` / 1.25rem).
 * Must stay below the compact dock tray (5.75rem) so they occupy separate bands.
 */
export const COMPACT_CORNER_CHROME_BOTTOM = "1.25rem" as const;

/**
 * Minimum logo top inset when safe-area is 0 (typical tablet Safari).
 * Notch phones still win via env(safe-area-inset-top).
 */
export const COMPACT_LOGO_MIN_INSET = "2.5rem" as const;

export type DesktopChromeInput = {
  width: number;
  /** true when `(hover: hover)` matches */
  hoverHover: boolean;
  /** true when `(pointer: fine)` matches */
  pointerFine: boolean;
};

export function isDesktopCanvasChrome(input: DesktopChromeInput): boolean {
  return (
    input.width >= DESKTOP_CHROME_MIN_WIDTH_PX &&
    input.hoverHover === true &&
    input.pointerFine === true
  );
}

export function isCompactCanvasChrome(input: DesktopChromeInput): boolean {
  return !isDesktopCanvasChrome(input);
}
