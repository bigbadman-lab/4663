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
  /** World-space X of the viewport's top-left corner (pre-scale). */
  x: number;
  /** World-space Y of the viewport's top-left corner (pre-scale). */
  y: number;
  /**
   * Local HOME fit scale only (IC3.2). Never networked.
   * `1` = identity; `< 1` = world appears smaller so HOME composition fits.
   */
  scale: number;
};

export type ViewportRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type WorldPoint = { x: number; y: number };

export type WorldPct = { leftPct: number; topPct: number };

export function normalizeCameraScale(scale: number | undefined): number {
  if (typeof scale !== "number" || !Number.isFinite(scale) || scale <= 0) {
    return 1;
  }
  return scale;
}

export function visibleWorldSize(
  viewportWidth: number,
  viewportHeight: number,
  scale: number,
): { width: number; height: number } {
  const s = normalizeCameraScale(scale);
  return {
    width: Math.max(1, viewportWidth) / s,
    height: Math.max(1, viewportHeight) / s,
  };
}

/** Clamp a world percentage into a recoverable band. */
export function clampWorldPct(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(98, Math.max(2, value));
}

/**
 * Screen → world (IC2 + IC3.2).
 * `world = (screen - viewportOrigin) / scale + camera`
 */
export function screenPointToWorldPoint(
  clientX: number,
  clientY: number,
  viewport: ViewportRect,
  camera: CanvasCamera,
): WorldPoint {
  const scale = normalizeCameraScale(camera.scale);
  return {
    x: (clientX - viewport.left) / scale + camera.x,
    y: (clientY - viewport.top) / scale + camera.y,
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

/**
 * IC3.1 / IC3.2 — world-space HOME composition anchors.
 * Derived from home-region + hero.ts CSS defaults (not PlayHTML offsets).
 */
export const HOME_LOGO_WORLD = {
  x: HOME_REGION_LEFT_PX + 24,
  y: HOME_REGION_TOP_PX + 24,
  width: 72,
  height: 72,
} as const;

export const HOME_HERO_TITLE_WORLD = {
  x: HOME_REGION_LEFT_PX + HOME_REGION_WIDTH_PX * 0.5,
  y: HOME_REGION_TOP_PX + HOME_REGION_HEIGHT_PX * 0.42,
} as const;

export const HOME_HERO_SUBTITLE_WORLD = {
  x: HOME_REGION_LEFT_PX + HOME_REGION_WIDTH_PX * 0.5,
  y: HOME_REGION_TOP_PX + HOME_REGION_HEIGHT_PX * 0.52,
} as const;

/** Desktop band: preserve canonical center-on-artboard framing at scale 1. */
export const HOME_FRAME_DESKTOP_MIN_WIDTH_PX = 1024 as const;

/**
 * Approximate fixed-chrome reserves for HOME optical framing (not layout).
 * Bottom covers dock + safe-area cushion + presence/clock band.
 */
export const HOME_FRAME_TOP_CHROME_PX = 56 as const;
export const HOME_FRAME_BOTTOM_CHROME_PX = 112 as const;

/** Padding around logo→hero→subtitle when computing HOME fit bounds. */
export const HOME_FIT_PAD_PX = 28 as const;

/** Half-width allowance for centred hero title glyph run. */
export const HOME_FIT_HERO_HALF_WIDTH_PX = 110 as const;

/** Space below subtitle for breathing room / participation cue. */
export const HOME_FIT_BELOW_SUBTITLE_PX = 72 as const;

/**
 * Floor for HOME fit scale so type stays readable on the narrowest phones.
 * Fit math still prefers the true fit when larger.
 */
export const HOME_FIT_MIN_SCALE = 0.34 as const;

/** Attribute written on `#4663-world` so PlayHTML drag can read local scale. */
export const WORLD_CAMERA_SCALE_ATTR = "data-4663-world-scale" as const;

/**
 * Canonical HOME content rectangle (world px) for fit-scale.
 * Fits logo + hero + subtitle — not the entire 1440×900 artboard.
 */
export function homeFitContentBounds(): {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
} {
  const left = HOME_LOGO_WORLD.x - HOME_FIT_PAD_PX;
  const top = HOME_LOGO_WORLD.y - HOME_FIT_PAD_PX;
  const right =
    Math.max(HOME_HERO_TITLE_WORLD.x, HOME_HERO_SUBTITLE_WORLD.x) +
    HOME_FIT_HERO_HALF_WIDTH_PX;
  const bottom = HOME_HERO_SUBTITLE_WORLD.y + HOME_FIT_BELOW_SUBTITLE_PX;
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

export function isWorldPointInCameraView(
  point: WorldPoint,
  camera: CanvasCamera,
  viewportWidth: number,
  viewportHeight: number,
  padPx = 0,
): boolean {
  const scale = normalizeCameraScale(camera.scale);
  const { width, height } = visibleWorldSize(
    viewportWidth,
    viewportHeight,
    scale,
  );
  return (
    point.x >= camera.x - padPx &&
    point.x <= camera.x + width + padPx &&
    point.y >= camera.y - padPx &&
    point.y <= camera.y + height + padPx
  );
}

/**
 * Local HOME camera for the current viewport (IC3.1 framing + IC3.2 fit scale).
 * Shared world / object positions are unchanged — only the local crop/scale adapts.
 */
export function homeCameraForViewport(
  viewportWidth: number,
  viewportHeight: number,
): CanvasCamera {
  const vw = Math.max(1, viewportWidth);
  const vh = Math.max(1, viewportHeight);

  const homeCenterX = HOME_REGION_LEFT_PX + HOME_REGION_WIDTH_PX / 2;
  const homeCenterY = HOME_REGION_TOP_PX + HOME_REGION_HEIGHT_PX / 2;

  // Desktop: keep the familiar full-artboard-centred crop at scale 1.
  if (vw >= HOME_FRAME_DESKTOP_MIN_WIDTH_PX) {
    return clampCamera(
      {
        x: homeCenterX - vw / 2,
        y: homeCenterY - vh / 2,
        scale: 1,
      },
      vw,
      vh,
    );
  }

  const content = homeFitContentBounds();
  const topChrome = Math.min(HOME_FRAME_TOP_CHROME_PX, vh * 0.1);
  const bottomChrome = Math.min(HOME_FRAME_BOTTOM_CHROME_PX, vh * 0.3);
  const sidePad = Math.min(16, vw * 0.04);
  const usableW = Math.max(1, vw - sidePad * 2);
  const usableH = Math.max(1, vh - topChrome - bottomChrome);

  // Largest scale ≤ 1 that fits the HOME composition into the usable viewport.
  const fitScale = Math.min(
    1,
    usableW / content.width,
    usableH / content.height,
  );
  const scale = Math.max(HOME_FIT_MIN_SCALE, fitScale);

  // Center content in the usable band (chrome-aware), in world units.
  const usableWorldW = usableW / scale;
  const usableWorldH = usableH / scale;
  const camX =
    content.left - (usableWorldW - content.width) / 2 - sidePad / scale;
  const camY =
    content.top - (usableWorldH - content.height) / 2 - topChrome / scale;

  return clampCamera({ x: camX, y: camY, scale }, vw, vh);
}

export function clampCamera(
  camera: CanvasCamera,
  viewportWidth: number,
  viewportHeight: number,
): CanvasCamera {
  const scale = normalizeCameraScale(camera.scale);
  const { width: visW, height: visH } = visibleWorldSize(
    viewportWidth,
    viewportHeight,
    scale,
  );
  const maxX = Math.max(0, WORLD_WIDTH_PX - visW);
  const maxY = Math.max(0, WORLD_HEIGHT_PX - visH);
  return {
    x: Math.min(maxX, Math.max(0, camera.x)),
    y: Math.min(maxY, Math.max(0, camera.y)),
    scale,
  };
}

/**
 * Pan by screen-space pointer delta (IC3.2: divide by scale so drag feels 1:1).
 */
export function panCamera(
  camera: CanvasCamera,
  dxScreen: number,
  dyScreen: number,
  viewportWidth: number,
  viewportHeight: number,
): CanvasCamera {
  const scale = normalizeCameraScale(camera.scale);
  // Dragging content right moves camera left (grab the world).
  return clampCamera(
    {
      x: camera.x - dxScreen / scale,
      y: camera.y - dyScreen / scale,
      scale,
    },
    viewportWidth,
    viewportHeight,
  );
}

export function camerasApproximatelyEqual(
  a: CanvasCamera,
  b: CanvasCamera,
  epsilon = 0.5,
): boolean {
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(normalizeCameraScale(a.scale) - normalizeCameraScale(b.scale)) <=
      0.001
  );
}

/**
 * World CSS transform (IC3.2).
 * Origin 0,0; `translate(-x*s, -y*s) scale(s)` so
 * screen = (world - camera) * scale.
 */
export function worldTransformStyle(camera: CanvasCamera): {
  transform: string;
  transformOrigin: string;
  width: number;
  height: number;
  scale: number;
} {
  const scale = normalizeCameraScale(camera.scale);
  return {
    width: WORLD_WIDTH_PX,
    height: WORLD_HEIGHT_PX,
    scale,
    transformOrigin: "0 0",
    transform: `translate(${-camera.x * scale}px, ${-camera.y * scale}px) scale(${scale})`,
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
