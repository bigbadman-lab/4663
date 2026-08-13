/**
 * Stage IC1 — large finite shared world + local camera (desktop pan).
 * Camera is never networked. World dimensions are fixed for all clients.
 */

export const WORLD_WIDTH_PX = 4800 as const;
export const WORLD_HEIGHT_PX = 3200 as const;

/**
 * Canonical home artboard inside the world.
 * Object CSS % origins resolve against this region (preserves today’s
 * desktop composition when the viewport matches this size).
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
 * @deprecated Prefer PLAYHTML_WORLD_BOUNDS_ID — IC1 world is PlayHTML bounds.
 * Kept as alias so existing CanMoveElement imports keep compiling during IC1.
 */
export const PLAYHTML_CANVAS_BOUNDS_ID = PLAYHTML_WORLD_BOUNDS_ID;

export type CanvasCamera = {
  x: number;
  y: number;
};

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
