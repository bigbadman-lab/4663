/**
 * Shared world-% size helpers for Lab canvas objects (NOTE, CHECKLIST).
 * Not a generic transform system — min/max are supplied by each module.
 */

import {
  clampWorldPct,
  WORLD_HEIGHT_PX,
  WORLD_WIDTH_PX,
  type WorldPct,
} from "@/lib/canvas/world-camera";

export type LabObjectSize = {
  widthPct: number;
  heightPct: number;
};

export type LabObjectSizeLimits = {
  widthPctMin: number;
  heightPctMin: number;
  widthPctMax: number;
  heightPctMax: number;
  widthPctDefault: number;
  heightPctDefault: number;
};

export const LAB_SPAWN_OFFSET_PCT = 2.25 as const;
export const LAB_SPAWN_GRID = 6 as const;

function isFinitePct(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clampOriginPct(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, value));
}

export function clampLabObjectSize(input: {
  widthPct: number;
  heightPct: number;
  originLeftPct: number;
  originTopPct: number;
  limits: LabObjectSizeLimits;
}): LabObjectSize {
  const originLeftPct = clampOriginPct(input.originLeftPct);
  const originTopPct = clampOriginPct(input.originTopPct);
  const roomW = Math.max(0, 100 - originLeftPct);
  const roomH = Math.max(0, 100 - originTopPct);
  const maxW = Math.min(input.limits.widthPctMax, roomW);
  const maxH = Math.min(input.limits.heightPctMax, roomH);
  const minW = Math.min(input.limits.widthPctMin, maxW);
  const minH = Math.min(input.limits.heightPctMin, maxH);
  const widthPct = isFinitePct(input.widthPct)
    ? input.widthPct
    : input.limits.widthPctDefault;
  const heightPct = isFinitePct(input.heightPct)
    ? input.heightPct
    : input.limits.heightPctDefault;
  return {
    widthPct: Math.min(maxW, Math.max(minW, widthPct)),
    heightPct: Math.min(maxH, Math.max(minH, heightPct)),
  };
}

export function worldDeltaToLabSizePct(
  deltaWorldX: number,
  deltaWorldY: number,
): { deltaWidthPct: number; deltaHeightPct: number } {
  return {
    deltaWidthPct: (deltaWorldX / WORLD_WIDTH_PX) * 100,
    deltaHeightPct: (deltaWorldY / WORLD_HEIGHT_PX) * 100,
  };
}

export function applyLabObjectResize(input: {
  widthPct: number;
  heightPct: number;
  originLeftPct: number;
  originTopPct: number;
  deltaWidthPct: number;
  deltaHeightPct: number;
  limits: LabObjectSizeLimits;
}): LabObjectSize {
  const dW = Number.isFinite(input.deltaWidthPct) ? input.deltaWidthPct : 0;
  const dH = Number.isFinite(input.deltaHeightPct) ? input.deltaHeightPct : 0;
  return clampLabObjectSize({
    widthPct: input.widthPct + dW,
    heightPct: input.heightPct + dH,
    originLeftPct: input.originLeftPct,
    originTopPct: input.originTopPct,
    limits: input.limits,
  });
}

export function fitLabObjectFrame(input: {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  limits: LabObjectSizeLimits;
}): {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
} {
  const size = clampLabObjectSize({
    widthPct: input.widthPct,
    heightPct: input.heightPct,
    originLeftPct: 0,
    originTopPct: 0,
    limits: input.limits,
  });
  let leftPct = clampOriginPct(input.leftPct);
  let topPct = clampOriginPct(input.topPct);
  if (leftPct + size.widthPct > 100) {
    leftPct = Math.max(0, 100 - size.widthPct);
  }
  if (topPct + size.heightPct > 100) {
    topPct = Math.max(0, 100 - size.heightPct);
  }
  const fitted = clampLabObjectSize({
    widthPct: size.widthPct,
    heightPct: size.heightPct,
    originLeftPct: leftPct,
    originTopPct: topPct,
    limits: input.limits,
  });
  return { leftPct, topPct, ...fitted };
}

export function frameFromCenterPct(input: {
  leftPct: number;
  topPct: number;
  limits: LabObjectSizeLimits;
}): {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
} {
  const size = clampLabObjectSize({
    widthPct: input.limits.widthPctDefault,
    heightPct: input.limits.heightPctDefault,
    originLeftPct: 0,
    originTopPct: 0,
    limits: input.limits,
  });
  const centerLeft = clampWorldPct(input.leftPct);
  const centerTop = clampWorldPct(input.topPct);
  return fitLabObjectFrame({
    leftPct: centerLeft - size.widthPct / 2,
    topPct: centerTop - size.heightPct / 2,
    widthPct: size.widthPct,
    heightPct: size.heightPct,
    limits: input.limits,
  });
}

export function nextLabSpawnPct(
  existingCount: number,
  base: WorldPct,
  offsetPct: number = LAB_SPAWN_OFFSET_PCT,
  grid: number = LAB_SPAWN_GRID,
): WorldPct {
  const n = Math.max(0, Math.floor(existingCount));
  const col = n % grid;
  const row = Math.floor(n / grid) % grid;
  return {
    leftPct: clampWorldPct(base.leftPct + col * offsetPct),
    topPct: clampWorldPct(base.topPct + row * offsetPct),
  };
}
