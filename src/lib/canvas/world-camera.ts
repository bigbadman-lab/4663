/**
 * Stage IC1 — large finite shared world + local camera (desktop pan).
 * Camera is never networked. World dimensions are fixed for all clients.
 */

export const WORLD_WIDTH_PX = 4800 as const;
export const WORLD_HEIGHT_PX = 3200 as const;

/**
 * Canonical home artboard inside the world.
 * Summon / PONS / hero / logo / pills keep %-origins against this region.
 * TEXT / DRAW use world %-origins (see IC2 helpers below).
 */
export const HOME_REGION_WIDTH_PX = 1440 as const;
export const HOME_REGION_HEIGHT_PX = 900 as const;

export const HOME_REGION_LEFT_PX = Math.floor(
  (WORLD_WIDTH_PX - HOME_REGION_WIDTH_PX) / 2,
) as number;
export const HOME_REGION_TOP_PX = Math.floor(
  (WORLD_HEIGHT_PX - HOME_REGION_HEIGHT_PX) / 2,
) as number;

/** DOM id for the PlayHTML movement bounds (= world, not viewport). */
export const PLAYHTML_WORLD_BOUNDS_ID = "4663-world" as const;

/** DOM id for the home artboard ( %-origin containing block). */
export const CANVAS_HOME_REGION_ID = "4663-home-region" as const;

/** Desktop empty-space pan: pixels of movement before click becomes pan. */
export const CANVAS_PAN_DRAG_THRESHOLD_PX = 6 as const;

/**
 * Touch empty-space pan threshold (IC3).
 * Slightly above mouse threshold to absorb finger jitter without feeling laggy.
 */
export const CANVAS_PAN_DRAG_THRESHOLD_TOUCH_PX = 10 as const;

export function panDragThresholdPx(
  pointerType: string | undefined,
): number {
  return pointerType === "touch"
    ? CANVAS_PAN_DRAG_THRESHOLD_TOUCH_PX
    : CANVAS_PAN_DRAG_THRESHOLD_PX;
}

/**
 * DRAW zone size as % of the fixed world, chosen so visual size on the
 * canonical HOME artboard matches the pre-IC1 ~22%×22% of a 1440×900 canvas:
 *   width  = 0.22 * 1440 / 4800 * 100 ≈ 6.6%
 *   height = 0.22 * 900  / 3200 * 100 ≈ 6.1875%
 */
export const DRAWING_ZONE_WIDTH_WORLD_PCT =
  (0.22 * HOME_REGION_WIDTH_PX * 100) / WORLD_WIDTH_PX;
export const DRAWING_ZONE_HEIGHT_WORLD_PCT =
  (0.22 * HOME_REGION_HEIGHT_PX * 100) / WORLD_HEIGHT_PX;

/** Dock create: fractions of the *current viewport* (not HOME / world). */
export const DOCK_CREATE_VIEWPORT_FRAC = {
  x: 0.68,
  y: 0.35,
} as const;

/**
 * @deprecated Prefer PLAYHTML_WORLD_BOUNDS_ID — IC1 world is PlayHTML bounds.
 * Kept as alias so existing CanMoveElement imports keep compiling during IC1.
 */
export const PLAYHTML_CANVAS_BOUNDS_ID = PLAYHTML_WORLD_BOUNDS_ID;

export type CanvasCamera = {
  x: number;
  y: number;
};

export type ViewportRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type WorldPoint = { x: number; y: number };

export type WorldPct = { leftPct: number; topPct: number };

/** Clamp a world percentage into a recoverable band. */
export function clampWorldPct(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(98, Math.max(2, value));
}

export function screenPointToWorldPoint(
  clientX: number,
  clientY: number,
  viewport: ViewportRect,
  camera: CanvasCamera,
): WorldPoint {
  return {
    x: clientX - viewport.left + camera.x,
    y: clientY - viewport.top + camera.y,
  };
}

export function worldPointToWorldPct(point: WorldPoint): WorldPct {
  return {
    leftPct: clampWorldPct((point.x / WORLD_WIDTH_PX) * 100),
    topPct: clampWorldPct((point.y / WORLD_HEIGHT_PX) * 100),
  };
}

export function screenPointToWorldPct(
  clientX: number,
  clientY: number,
  viewport: ViewportRect,
  camera: CanvasCamera,
): WorldPct {
  return worldPointToWorldPct(
    screenPointToWorldPoint(clientX, clientY, viewport, camera),
  );
}

/** Viewport-relative dock create point → world %. */
export function dockCreateWorldPct(
  viewport: ViewportRect,
  camera: CanvasCamera,
  frac: { x: number; y: number } = DOCK_CREATE_VIEWPORT_FRAC,
): WorldPct {
  const clientX = viewport.left + viewport.width * frac.x;
  const clientY = viewport.top + viewport.height * frac.y;
  return screenPointToWorldPct(clientX, clientY, viewport, camera);
}

/** Map a HOME-artboard % into world % (Summon / MARK dock, etc.). */
export function homePctToWorldPct(
  leftPct: number,
  topPct: number,
): WorldPct {
  return worldPointToWorldPct({
    x: HOME_REGION_LEFT_PX + (leftPct / 100) * HOME_REGION_WIDTH_PX,
    y: HOME_REGION_TOP_PX + (topPct / 100) * HOME_REGION_HEIGHT_PX,
  });
}

/**
 * Center a DRAW zone on a world % click; keep the full zone inside the world.
 */
export function drawingZoneOriginFromWorldPct(
  leftPct: number,
  topPct: number,
  widthPct: number = DRAWING_ZONE_WIDTH_WORLD_PCT,
  heightPct: number = DRAWING_ZONE_HEIGHT_WORLD_PCT,
): {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
} {
  const w = Math.min(100, Math.max(0.5, widthPct));
  const h = Math.min(100, Math.max(0.5, heightPct));
  const halfW = w / 2;
  const halfH = h / 2;
  return {
    leftPct: Math.min(100 - w, Math.max(0, leftPct - halfW)),
    topPct: Math.min(100 - h, Math.max(0, topPct - halfH)),
    widthPct: w,
    heightPct: h,
  };
}

export function drawingZoneAspectFromWorldPct(
  widthPct: number,
  heightPct: number,
): number {
  const w = (WORLD_WIDTH_PX * widthPct) / 100;
  const h = (WORLD_HEIGHT_PX * heightPct) / 100;
  if (!(h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) return 1;
  return w / h;
}

export function homeCameraForViewport(
  viewportWidth: number,
  viewportHeight: number,
): CanvasCamera {
  const vw = Math.max(1, viewportWidth);
  const vh = Math.max(1, viewportHeight);
  const homeCenterX = HOME_REGION_LEFT_PX + HOME_REGION_WIDTH_PX / 2;
  const homeCenterY = HOME_REGION_TOP_PX + HOME_REGION_HEIGHT_PX / 2;
  return clampCamera(
    {
      x: homeCenterX - vw / 2,
      y: homeCenterY - vh / 2,
    },
    vw,
    vh,
  );
}

export function clampCamera(
  camera: CanvasCamera,
  viewportWidth: number,
  viewportHeight: number,
): CanvasCamera {
  const vw = Math.max(1, viewportWidth);
  const vh = Math.max(1, viewportHeight);
  const maxX = Math.max(0, WORLD_WIDTH_PX - vw);
  const maxY = Math.max(0, WORLD_HEIGHT_PX - vh);
  return {
    x: Math.min(maxX, Math.max(0, camera.x)),
    y: Math.min(maxY, Math.max(0, camera.y)),
  };
}

export function panCamera(
  camera: CanvasCamera,
  dx: number,
  dy: number,
  viewportWidth: number,
  viewportHeight: number,
): CanvasCamera {
  // Dragging content right moves camera left (grab the world).
  return clampCamera(
    { x: camera.x - dx, y: camera.y - dy },
    viewportWidth,
    viewportHeight,
  );
}

export function camerasApproximatelyEqual(
  a: CanvasCamera,
  b: CanvasCamera,
  epsilon = 0.5,
): boolean {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

export function worldTransformStyle(camera: CanvasCamera): {
  transform: string;
  width: number;
  height: number;
} {
  return {
    width: WORLD_WIDTH_PX,
    height: WORLD_HEIGHT_PX,
    transform: `translate(${-camera.x}px, ${-camera.y}px)`,
  };
}

export function homeRegionStyle(): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  return {
    left: HOME_REGION_LEFT_PX,
    top: HOME_REGION_TOP_PX,
    width: HOME_REGION_WIDTH_PX,
    height: HOME_REGION_HEIGHT_PX,
  };
}

/** True when pointer event should be eligible to start desktop pan. */
export function isCanvasPanHitTarget(target: EventTarget | null): boolean {
  if (target == null || typeof target !== "object") return false;
  if (!("closest" in target) || typeof (target as Element).closest !== "function") {
    return false;
  }
  return Boolean(
    (target as Element).closest(
      "[data-4663-canvas-empty-hit],[data-4663-world-pan-hit]",
    ),
  );
}
