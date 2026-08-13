"use client";

/**
 * Stage IC1–IC3.2.1 — local camera + empty-space pan (desktop + touch).
 * Boot may use fitted scale; HOME and first real pan recover to scale = 1.
 * Never networked.
 */

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  clampCamera,
  HOME_REGION_HEIGHT_PX,
  HOME_REGION_WIDTH_PX,
  homeCameraForViewport,
  initialHomeCameraForViewport,
  isCanvasPanHitTarget,
  normalizeCameraScale,
  normalizeCameraToScaleOnePreservingCenter,
  panCamera,
  panDragThresholdPx,
  WORLD_CAMERA_SCALE_ATTR,
  type CanvasCamera,
  type ViewportRect,
  worldTransformStyle,
} from "@/lib/canvas/world-camera";
import { dispatchEmptyCanvasClick } from "@/lib/social/canvas-create-actions";

/** Module flag: empty-canvas click must ignore post-pan synthetic clicks. */
let suppressEmptyCanvasClick = false;

export function shouldSuppressEmptyCanvasClick(): boolean {
  return suppressEmptyCanvasClick;
}

/** While TEXT/DRAW/MARK create UI owns input, do not start empty-space pan. */
let createUiBlocksPan = false;

export function setCreateUiBlocksPan(blocked: boolean): void {
  createUiBlocksPan = blocked;
}

export type CanvasPlacementSnapshot = {
  viewport: ViewportRect;
  camera: CanvasCamera;
};

let getPlacementSnapshotImpl: (() => CanvasPlacementSnapshot | null) | null =
  null;

/** Live viewport + local camera for screen→world placement (never networked). */
export function getCanvasPlacementSnapshot(): CanvasPlacementSnapshot | null {
  return getPlacementSnapshotImpl?.() ?? null;
}

export type UseCanvasCameraResult = {
  worldRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
  goHome: () => void;
  onViewportPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

export function useCanvasCamera(): UseCanvasCameraResult {
  const worldRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<CanvasCamera>({ x: 0, y: 0, scale: 1 });
  const panRef = useRef<{
    pointerId: number;
    pointerType: string;
    startX: number;
    startY: number;
    origin: CanvasCamera;
    active: boolean;
    captureEl: HTMLElement | null;
  } | null>(null);

  const applyCamera = useCallback((next: CanvasCamera) => {
    const viewport = viewportRef.current;
    const vw = viewport?.clientWidth ?? 0;
    const vh = viewport?.clientHeight ?? 0;
    const clamped = vw > 0 && vh > 0 ? clampCamera(next, vw, vh) : next;
    cameraRef.current = clamped;
    const world = worldRef.current;
    if (world) {
      const style = worldTransformStyle(clamped);
      world.style.width = `${style.width}px`;
      world.style.height = `${style.height}px`;
      world.style.transformOrigin = style.transformOrigin;
      world.style.transform = style.transform;
      world.setAttribute(WORLD_CAMERA_SCALE_ATTR, String(style.scale));
    }
  }, []);

  /** Drop in-progress pan so HOME / next drag start cleanly. */
  const cancelActivePan = useCallback(() => {
    const pan = panRef.current;
    panRef.current = null;
    document.body.removeAttribute("data-4663-panning");
    suppressEmptyCanvasClick = false;
    if (!pan?.captureEl) return;
    try {
      pan.captureEl.releasePointerCapture(pan.pointerId);
    } catch {
      // ignore — capture may already be gone
    }
  }, []);

  const goHome = useCallback(() => {
    // 1–2. Current viewport → normal HOME camera (always scale = 1).
    const viewport = viewportRef.current;
    const vw = viewport?.clientWidth ?? HOME_REGION_WIDTH_PX;
    const vh = viewport?.clientHeight ?? HOME_REGION_HEIGHT_PX;
    // 3. Cancel transient pan (pointer id, capture, deltas, grabbing flag).
    cancelActivePan();
    // 4–5. Immediate deterministic reset; shared world untouched.
    applyCamera(homeCameraForViewport(vw, vh));
  }, [applyCamera, cancelActivePan]);

  useEffect(() => {
    // Initial boot/refresh only — may use fitted scale on narrow mobile.
    const viewport = viewportRef.current;
    const vw = viewport?.clientWidth ?? HOME_REGION_WIDTH_PX;
    const vh = viewport?.clientHeight ?? HOME_REGION_HEIGHT_PX;
    applyCamera(initialHomeCameraForViewport(vw, vh));

    if (!viewport || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      // Clamp only — do not reapply fitted scale or auto-HOME on resize (IC2.1 / IC3.2.1).
      applyCamera(cameraRef.current);
    });
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [applyCamera]);

  useEffect(() => {
    getPlacementSnapshotImpl = () => {
      const viewport = viewportRef.current;
      if (!viewport) return null;
      const rect = viewport.getBoundingClientRect();
      return {
        viewport: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
        camera: { ...cameraRef.current },
      };
    };
    return () => {
      getPlacementSnapshotImpl = null;
    };
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const pan = panRef.current;
      if (!pan || event.pointerId !== pan.pointerId) return;
      const dx = event.clientX - pan.startX;
      const dy = event.clientY - pan.startY;
      if (!pan.active) {
        if (Math.hypot(dx, dy) < panDragThresholdPx(pan.pointerType)) return;
        pan.active = true;
        suppressEmptyCanvasClick = true;
        document.body.setAttribute("data-4663-panning", "true");

        // First real pan: leave fitted landing scale; keep viewport-center world point.
        if (normalizeCameraScale(pan.origin.scale) < 1) {
          const viewport = viewportRef.current;
          const vw = viewport?.clientWidth ?? HOME_REGION_WIDTH_PX;
          const vh = viewport?.clientHeight ?? HOME_REGION_HEIGHT_PX;
          pan.origin = normalizeCameraToScaleOnePreservingCenter(
            pan.origin,
            vw,
            vh,
          );
        }
      }
      const viewport = viewportRef.current;
      const vw = viewport?.clientWidth ?? HOME_REGION_WIDTH_PX;
      const vh = viewport?.clientHeight ?? HOME_REGION_HEIGHT_PX;
      applyCamera(panCamera(pan.origin, dx, dy, vw, vh));
    };

    const endPan = (event: PointerEvent) => {
      const pan = panRef.current;
      if (!pan || event.pointerId !== pan.pointerId) return;
      const wasActivePan = pan.active;
      panRef.current = null;
      document.body.removeAttribute("data-4663-panning");
      if (pan.captureEl) {
        try {
          pan.captureEl.releasePointerCapture(event.pointerId);
        } catch {
          // ignore
        }
      }
      if (wasActivePan) {
        // Pan gesture: suppress the synthetic click that may follow pointerup.
        suppressEmptyCanvasClick = true;
        window.setTimeout(() => {
          suppressEmptyCanvasClick = false;
        }, 0);
        return;
      }

      // pointercancel is not a tap — do not open create UI.
      if (event.type === "pointercancel") return;

      // Tap / sub-threshold drag: open create menu explicitly.
      // Viewport pointer capture retargets events away from empty-hit, so the
      // empty-hit onClick often never fires after the world/camera refactor.
      dispatchEmptyCanvasClick(
        new MouseEvent("click", {
          clientX: event.clientX,
          clientY: event.clientY,
          bubbles: true,
          cancelable: true,
          view: window,
        }),
      );
      // If a native click still arrives on empty-hit, ignore the duplicate.
      suppressEmptyCanvasClick = true;
      window.setTimeout(() => {
        suppressEmptyCanvasClick = false;
      }, 0);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endPan);
    window.addEventListener("pointercancel", endPan);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endPan);
      window.removeEventListener("pointercancel", endPan);
    };
  }, [applyCamera]);

  const onViewportPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    // Primary pointer only — no multi-finger camera zoom (IC3).
    if (!event.isPrimary) return;
    if (event.button !== 0) return;
    if (createUiBlocksPan) return;
    // Empty canvas only — objects / DRAW / TEXT / chrome are not pan hit targets.
    if (!isCanvasPanHitTarget(event.target)) return;
    // One pan at a time.
    if (panRef.current) return;

    panRef.current = {
      pointerId: event.pointerId,
      pointerType: event.pointerType || "mouse",
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...cameraRef.current },
      active: false,
      captureEl: event.currentTarget,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  return {
    worldRef,
    viewportRef,
    goHome,
    onViewportPointerDown,
  };
}
