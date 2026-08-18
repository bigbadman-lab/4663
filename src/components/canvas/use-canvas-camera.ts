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
  normalizeCameraScale,
  normalizeCameraToScaleOnePreservingCenter,
  panCamera,
  WORLD_CAMERA_SCALE_ATTR,
  type CanvasCamera,
  type ViewportRect,
  worldTransformStyle,
} from "@/lib/canvas/world-camera";
import {
  activateOverlayInteractiveTarget,
  overlayInteractiveTargetFromPoint,
} from "@/lib/canvas/interactive-control";
import { createCanvasPanFrameCoalescer } from "@/lib/canvas/canvas-pan-frame";
import {
  canvasPanHasClaimedPointer,
  canvasPanMovementPx,
  createCanvasPanGesture,
  isUsableCanvasPointer,
  shouldActivateOverlayTargetOnRelease,
  shouldPromoteCanvasPan,
  shouldTrackCanvasPan,
} from "@/lib/canvas/canvas-pan-gesture";
import { dispatchEmptyCanvasClick } from "@/lib/social/canvas-create-actions";
import {
  nextViewportCameraAction,
  readViewportClientSize,
} from "@/lib/canvas/viewport-client-size";
import { recordTapDebug, summarizeEventNode } from "@/lib/canvas/tap-debug";

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
    viewportWidth: number;
    viewportHeight: number;
  } | null>(null);
  const panFrameRef = useRef<ReturnType<
    typeof createCanvasPanFrameCoalescer
  > | null>(null);
  const overlayTapRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    pointerType: string;
    element: Element;
  } | null>(null);

  const applyCamera = useCallback(
    (next: CanvasCamera, options?: { writeLayout?: boolean }) => {
      const viewport = viewportRef.current;
      const size = readViewportClientSize(viewport);
      const clamped =
        size != null ? clampCamera(next, size.width, size.height) : next;
      cameraRef.current = clamped;
      const world = worldRef.current;
      if (world) {
        const style = worldTransformStyle(clamped);
        // Pan rewrites transform every sample; width/height/origin are static.
        if (options?.writeLayout !== false) {
          world.style.width = `${style.width}px`;
          world.style.height = `${style.height}px`;
          world.style.transformOrigin = style.transformOrigin;
        }
        world.style.transform = style.transform;
        world.setAttribute(WORLD_CAMERA_SCALE_ATTR, String(style.scale));
      }
    },
    [],
  );

  /** Drop in-progress pan so HOME / next drag start cleanly. */
  const cancelActivePan = useCallback(() => {
    panFrameRef.current?.cancel();
    const pan = panRef.current;
    panRef.current = null;
    overlayTapRef.current = null;
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
    const size = readViewportClientSize(viewportRef.current);
    const vw = size?.width ?? HOME_REGION_WIDTH_PX;
    const vh = size?.height ?? HOME_REGION_HEIGHT_PX;
    // 3. Cancel transient pan (pointer id, capture, deltas, grabbing flag).
    cancelActivePan();
    // 4–5. Immediate deterministic reset; shared world untouched.
    applyCamera(homeCameraForViewport(vw, vh));
  }, [applyCamera, cancelActivePan]);

  useEffect(() => {
    // Initial boot/refresh only — may use fitted scale on narrow mobile.
    // Older Safari can report 0×0 before the overlay/toolbar layout settles;
    // wait for the first positive container box, then HOME. Later resizes clamp.
    const viewport = viewportRef.current;
    let framed = false;
    const frameIfReady = (): boolean => {
      const size = readViewportClientSize(viewportRef.current);
      const action = nextViewportCameraAction(framed, size);
      if (action === "wait" || !size) return false;
      const vw = size.width;
      const vh = size.height;
      if (action === "initial-home") {
        framed = true;
        applyCamera(initialHomeCameraForViewport(vw, vh));
        return true;
      }
      // Clamp only — do not reapply fitted scale or auto-HOME on resize (IC2.1 / IC3.2.1).
      applyCamera(cameraRef.current);
      return true;
    };
    frameIfReady();

    if (!viewport || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      frameIfReady();
    });
    ro.observe(viewport);
    const raf =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(() => {
            frameIfReady();
          })
        : 0;
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
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
    const applyPanSample = (sample: { dx: number; dy: number }) => {
      const pan = panRef.current;
      if (!pan) return;
      applyCamera(
        panCamera(
          pan.origin,
          sample.dx,
          sample.dy,
          pan.viewportWidth,
          pan.viewportHeight,
        ),
        { writeLayout: false },
      );
    };
    const panFrame = createCanvasPanFrameCoalescer(applyPanSample);
    panFrameRef.current = panFrame;

    const onPointerMove = (event: PointerEvent) => {
      const overlayTap = overlayTapRef.current;
      if (overlayTap && event.pointerId === overlayTap.pointerId) {
        return;
      }

      const pan = panRef.current;
      if (!pan || event.pointerId !== pan.pointerId) return;
      const dx = event.clientX - pan.startX;
      const dy = event.clientY - pan.startY;
      if (!pan.active) {
        if (!shouldPromoteCanvasPan(pan, event.clientX, event.clientY)) return;
        pan.active = true;
        suppressEmptyCanvasClick = true;
        document.body.setAttribute("data-4663-panning", "true");
        // Claim the pointer only after this is a pan — capturing on pointerdown
        // prevents Safari from synthesizing clicks on overlay controls.
        if (pan.captureEl) {
          try {
            pan.captureEl.setPointerCapture(pan.pointerId);
          } catch {
            // ignore
          }
        }

        // First real pan: leave fitted landing scale; keep viewport-center world point.
        if (normalizeCameraScale(pan.origin.scale) < 1) {
          pan.origin = normalizeCameraToScaleOnePreservingCenter(
            pan.origin,
            pan.viewportWidth,
            pan.viewportHeight,
          );
        }
      }
      // Coalesce to one transform per frame; pointerup flushes the last sample.
      panFrame.push({ dx, dy });
    };

    const endPan = (event: PointerEvent) => {
      const overlayTap = overlayTapRef.current;
      if (overlayTap && event.pointerId === overlayTap.pointerId) {
        overlayTapRef.current = null;
        const moved = canvasPanMovementPx(overlayTap, event.clientX, event.clientY);
        if (
          event.type !== "pointercancel" &&
          shouldActivateOverlayTargetOnRelease({
            overlayElement: overlayTap.element,
            pointerMovedPx: moved,
            pointerType: overlayTap.pointerType,
            eventTarget: event.target,
          })
        ) {
          recordTapDebug("handler", "overlay-recovery-click", {
            target: summarizeEventNode(overlayTap.element),
            path: "synthetic element.click() after viewport pointerup",
          });
          activateOverlayInteractiveTarget(overlayTap.element);
        } else {
          recordTapDebug("handler", "overlay-recovery-skip", {
            target: summarizeEventNode(overlayTap.element),
            path: `type=${event.type} moved=${String(moved)}`,
          });
        }
        window.setTimeout(() => {
          suppressEmptyCanvasClick = false;
        }, 0);
        return;
      }

      const pan = panRef.current;
      if (!pan || event.pointerId !== pan.pointerId) return;
      const wasActivePan = canvasPanHasClaimedPointer(pan);
      const dx = event.clientX - pan.startX;
      const dy = event.clientY - pan.startY;
      // Flush while panRef still holds origin + viewport size.
      if (wasActivePan) {
        if (event.type === "pointercancel") {
          panFrame.cancel();
        } else {
          panFrame.flush({ dx, dy });
        }
      } else {
        panFrame.cancel();
      }
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
        suppressEmptyCanvasClick = true;
        window.setTimeout(() => {
          suppressEmptyCanvasClick = false;
        }, 0);
        return;
      }

      // pointercancel is not a tap — do not open create UI.
      if (event.type === "pointercancel") return;

      // Tap / sub-threshold drag: open create menu explicitly.
      // Empty-hit onClick often never fires after the world/camera refactor.
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
      panFrame.cancel();
      panFrameRef.current = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endPan);
      window.removeEventListener("pointercancel", endPan);
    };
  }, [applyCamera]);

  const onViewportPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    // Overlay recovery first: older WebKit can deliver the hit to the world
    // under a pointer-events:none chrome stacking context. Do not require
    // isPrimary/button before this — those fields are unreliable on Safari 15.
    const overlayInteractive = overlayInteractiveTargetFromPoint(
      event.clientX,
      event.clientY,
      typeof document !== "undefined" ? document : null,
    );
    if (overlayInteractive) {
      recordTapDebug("handler", "overlay-recovery-down", {
        target: summarizeEventNode(overlayInteractive),
        path: "viewport pointerdown matched overlay control",
      });
      overlayTapRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        pointerType: event.pointerType || "mouse",
        element: overlayInteractive,
      };
      suppressEmptyCanvasClick = true;
      return;
    }

    // Primary pointer only — no multi-finger camera zoom (IC3).
    if (!isUsableCanvasPointer(event)) return;
    if (createUiBlocksPan) return;

    if (
      !shouldTrackCanvasPan({
        isPrimary: event.isPrimary,
        button: event.button,
        createUiBlocksPan,
        target: event.target,
        overlayInteractive,
      })
    ) {
      return;
    }
    // One pan at a time.
    if (panRef.current) return;

    const gesture = createCanvasPanGesture({
      pointerId: event.pointerId,
      pointerType: event.pointerType || "mouse",
      clientX: event.clientX,
      clientY: event.clientY,
    });
    const size = readViewportClientSize(viewportRef.current);
    panRef.current = {
      ...gesture,
      origin: { ...cameraRef.current },
      captureEl: event.currentTarget,
      viewportWidth: size?.width ?? HOME_REGION_WIDTH_PX,
      viewportHeight: size?.height ?? HOME_REGION_HEIGHT_PX,
    };
  };

  return {
    worldRef,
    viewportRef,
    goHome,
    onViewportPointerDown,
  };
}
