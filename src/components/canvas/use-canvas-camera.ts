"use client";

/**
 * Stage IC1 — local camera + desktop empty-space pan (never networked).
 */

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  CANVAS_PAN_DRAG_THRESHOLD_PX,
  clampCamera,
  HOME_REGION_HEIGHT_PX,
  HOME_REGION_WIDTH_PX,
  homeCameraForViewport,
  isCanvasPanHitTarget,
  panCamera,
  type CanvasCamera,
  worldTransformStyle,
} from "@/lib/canvas/world-camera";

/** Module flag: empty-canvas click must ignore post-pan synthetic clicks. */
let suppressEmptyCanvasClick = false;

export function shouldSuppressEmptyCanvasClick(): boolean {
  return suppressEmptyCanvasClick;
}

function isDesktopPointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
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
  const cameraRef = useRef<CanvasCamera>({ x: 0, y: 0 });
  const panRef = useRef<{
    pointerId: number;
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
      world.style.transform = style.transform;
    }
  }, []);

  const goHome = useCallback(() => {
    const viewport = viewportRef.current;
    const vw = viewport?.clientWidth ?? HOME_REGION_WIDTH_PX;
    const vh = viewport?.clientHeight ?? HOME_REGION_HEIGHT_PX;
    applyCamera(homeCameraForViewport(vw, vh));
  }, [applyCamera]);

  useEffect(() => {
    goHome();
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      applyCamera(cameraRef.current);
    });
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [applyCamera, goHome]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const pan = panRef.current;
      if (!pan || event.pointerId !== pan.pointerId) return;
      const dx = event.clientX - pan.startX;
      const dy = event.clientY - pan.startY;
      if (!pan.active) {
        if (Math.hypot(dx, dy) < CANVAS_PAN_DRAG_THRESHOLD_PX) return;
        pan.active = true;
        suppressEmptyCanvasClick = true;
        document.body.setAttribute("data-4663-panning", "true");
      }
      const viewport = viewportRef.current;
      const vw = viewport?.clientWidth ?? HOME_REGION_WIDTH_PX;
      const vh = viewport?.clientHeight ?? HOME_REGION_HEIGHT_PX;
      applyCamera(panCamera(pan.origin, dx, dy, vw, vh));
    };

    const endPan = (event: PointerEvent) => {
      const pan = panRef.current;
      if (!pan || event.pointerId !== pan.pointerId) return;
      panRef.current = null;
      document.body.removeAttribute("data-4663-panning");
      if (pan.captureEl) {
        try {
          pan.captureEl.releasePointerCapture(event.pointerId);
        } catch {
          // ignore
        }
      }
      if (pan.active) {
        window.setTimeout(() => {
          suppressEmptyCanvasClick = false;
        }, 0);
      }
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
    if (event.button !== 0) return;
    if (!isDesktopPointer()) return;
    if (!isCanvasPanHitTarget(event.target)) return;

    panRef.current = {
      pointerId: event.pointerId,
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
