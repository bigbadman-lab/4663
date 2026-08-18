/**
 * Tight PONS MONITOR / RADAR hit geometry.
 *
 * Host bounds must equal the visible card — not an untranslated wrapper
 * whose empty bottom-right quadrant stays selectable.
 */

import {
  canvasObjectOverlapHit,
  hostMatchesVisible,
  pointInCanvasObjectRect,
  pointJustOutsideCanvasObject,
  type CanvasObjectHitPoint,
  type CanvasObjectHitRect,
  type CanvasObjectOverlapTarget,
} from "@/lib/social/canvas-object-hitbox";

export type PonsRadarHitRect = CanvasObjectHitRect;
export type PonsRadarHitPoint = CanvasObjectHitPoint;
export type PonsRadarOverlapTarget = CanvasObjectOverlapTarget;

export type PonsRadarPointerRegion =
  | "header"
  | "body"
  | "control"
  | "outside";

/** Default PONS MONITOR panel — `w-[20rem] h-[13.5rem]` at 16px rem. */
export const PONS_MONITOR_PANEL_WIDTH_PX = 320 as const;
export const PONS_MONITOR_PANEL_HEIGHT_PX = 216 as const;

/** sm: `w-[21rem] h-[14rem]`. */
export const PONS_MONITOR_PANEL_WIDTH_SM_PX = 336 as const;
export const PONS_MONITOR_PANEL_HEIGHT_SM_PX = 224 as const;

/** Persistent RADAR card — `min-w-[11rem] max-w-[13rem]`. */
export const RADAR_CARD_MIN_WIDTH_PX = 176 as const;
export const RADAR_CARD_MAX_WIDTH_PX = 208 as const;

/** Ephemeral RADAR alert — `w-[10.5rem]` / `sm:w-[11.5rem]`. */
export const RADAR_ALERT_WIDTH_PX = 168 as const;
export const RADAR_ALERT_WIDTH_SM_PX = 184 as const;

/**
 * Visual + hit rect when the PlayHTML host is centered on an origin.
 * Inner-wrapper translate is forbidden: that leaves the host's untranslated
 * box hanging to the bottom-right of the origin.
 */
export function ponsRadarCenteredHostRect(input: {
  originLeft: number;
  originTop: number;
  width: number;
  height: number;
}): PonsRadarHitRect {
  return {
    left: input.originLeft - input.width / 2,
    top: input.originTop - input.height / 2,
    width: input.width,
    height: input.height,
  };
}

/**
 * Pre-fix host layout: top-left pinned at origin while the visible card is
 * centered via an inner wrapper. The bottom-right quadrant is empty but
 * still hittable.
 */
export function ponsRadarOversizedInnerTranslateHostRect(input: {
  originLeft: number;
  originTop: number;
  width: number;
  height: number;
}): PonsRadarHitRect {
  return {
    left: input.originLeft,
    top: input.originTop,
    width: input.width,
    height: input.height,
  };
}

export function pointInPonsRadarRect(
  point: PonsRadarHitPoint,
  rect: PonsRadarHitRect,
): boolean {
  return pointInCanvasObjectRect(point, rect);
}

export function pointJustOutsidePonsRadar(
  rect: PonsRadarHitRect,
  edge: "left" | "right" | "top" | "bottom",
  gap = 1,
): PonsRadarHitPoint {
  return pointJustOutsideCanvasObject(rect, edge, gap);
}

export function ponsRadarHostMatchesVisible(
  host: PonsRadarHitRect,
  visible: PonsRadarHitRect,
): boolean {
  return hostMatchesVisible(host, visible);
}

export function ponsRadarOverlapHit(input: {
  object: PonsRadarHitRect;
  other: PonsRadarHitRect;
  point: PonsRadarHitPoint;
}): PonsRadarOverlapTarget {
  return canvasObjectOverlapHit(input);
}

/** PONS MONITOR / terminal: only the visible header/top strip starts PlayHTML move. */
export function ponsRadarRegionStartsMove(
  region: PonsRadarPointerRegion,
): boolean {
  return region === "header";
}

/**
 * Ephemeral RADAR alert: the visible card (header + decorative body) starts
 * a move. OPEN / outside do not.
 */
export function radarAlertRegionStartsMove(
  region: PonsRadarPointerRegion,
): boolean {
  return region === "header" || region === "body";
}

/**
 * Shrinking content must shrink the hittable host. A stale min-size larger
 * than the rendered card is a regression.
 */
export function ponsRadarHostTracksContentSize(input: {
  host: { width: number; height: number };
  content: { width: number; height: number };
}): boolean {
  return (
    input.host.width === input.content.width &&
    input.host.height === input.content.height
  );
}
