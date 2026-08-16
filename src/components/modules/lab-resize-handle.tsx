"use client";

/**
 * Bottom-right resize for Lab objects.
 * Native capture listeners — do not use useInteractiveControlProtection here.
 */

import { useEffect, useRef } from "react";
import {
  getCanvasPlacementSnapshot,
  setCreateUiBlocksPan,
} from "@/components/canvas/use-canvas-camera";
import {
  applyLabObjectResize,
  worldDeltaToLabSizePct,
  type LabObjectSize,
  type LabObjectSizeLimits,
} from "@/lib/modules/lab-object-size";
import {
  WORLD_HEIGHT_PX,
  WORLD_WIDTH_PX,
  screenPointToWorldPoint,
} from "@/lib/canvas/world-camera";

export type LabResizeHandleProps = {
  hostSelector: string;
  editorSelector?: string;
  size: LabObjectSize;
  limits: LabObjectSizeLimits;
  onResize: (size: LabObjectSize) => void;
  ariaLabel: string;
  dataAttr: string;
};

type LabResizeGesture = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  widthPct: number;
  heightPct: number;
  originLeftPct: number;
  originTopPct: number;
};

function stopNativeMoveStart(event: Event): void {
  event.stopPropagation();
}

export function LabResizeHandle({
  hostSelector,
  editorSelector,
  size,
  limits,
  onResize,
  ariaLabel,
  dataAttr,
}: LabResizeHandleProps) {
  const handleRef = useRef<HTMLButtonElement | null>(null);
  const sizeRef = useRef(size);
  const limitsRef = useRef(limits);
  const onResizeRef = useRef(onResize);
  const hostSelectorRef = useRef(hostSelector);
  const editorSelectorRef = useRef(editorSelector);

  useEffect(() => {
    sizeRef.current = size;
    limitsRef.current = limits;
    onResizeRef.current = onResize;
    hostSelectorRef.current = hostSelector;
    editorSelectorRef.current = editorSelector;
  }, [size, limits, onResize, hostSelector, editorSelector]);

  useEffect(() => {
    const el = handleRef.current;
    if (!el) return;

    let gesture: LabResizeGesture | null = null;

    const onPointerMove = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const snapshot = getCanvasPlacementSnapshot();
      if (snapshot == null) return;
      const start = screenPointToWorldPoint(
        gesture.startClientX,
        gesture.startClientY,
        snapshot.viewport,
        snapshot.camera,
      );
      const next = screenPointToWorldPoint(
        event.clientX,
        event.clientY,
        snapshot.viewport,
        snapshot.camera,
      );
      const delta = worldDeltaToLabSizePct(next.x - start.x, next.y - start.y);
      onResizeRef.current(
        applyLabObjectResize({
          widthPct: gesture.widthPct,
          heightPct: gesture.heightPct,
          originLeftPct: gesture.originLeftPct,
          originTopPct: gesture.originTopPct,
          deltaWidthPct: delta.deltaWidthPct,
          deltaHeightPct: delta.deltaHeightPct,
          limits: limitsRef.current,
        }),
      );
    };

    const endGesture = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      gesture = null;
      setCreateUiBlocksPan(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endGesture);
      window.removeEventListener("pointercancel", endGesture);
      try {
        if (el.hasPointerCapture(event.pointerId)) {
          el.releasePointerCapture(event.pointerId);
        }
      } catch {
        // already released
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      event.stopPropagation();
      if (gesture) return;
      if (event.button !== 0 && event.pointerType === "mouse") return;
      event.preventDefault();

      const host = el.closest(hostSelectorRef.current);
      const snapshot = getCanvasPlacementSnapshot();
      if (!(host instanceof HTMLElement) || snapshot == null) return;

      const current = sizeRef.current;
      const active = document.activeElement;
      const editorSel = editorSelectorRef.current;
      if (active instanceof HTMLElement && editorSel) {
        if (host.querySelector(editorSel) === active || active.closest(editorSel)) {
          active.blur();
        }
      }

      const rect = host.getBoundingClientRect();
      const origin = screenPointToWorldPoint(
        rect.left,
        rect.top,
        snapshot.viewport,
        snapshot.camera,
      );
      gesture = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        widthPct: current.widthPct,
        heightPct: current.heightPct,
        originLeftPct: (origin.x / WORLD_WIDTH_PX) * 100,
        originTopPct: (origin.y / WORLD_HEIGHT_PX) * 100,
      };

      setCreateUiBlocksPan(true);
      try {
        el.setPointerCapture(event.pointerId);
      } catch {
        // window listeners still receive move/up
      }
      window.addEventListener("pointermove", onPointerMove, { passive: false });
      window.addEventListener("pointerup", endGesture);
      window.addEventListener("pointercancel", endGesture);
    };

    const capture: AddEventListenerOptions = { capture: true };
    el.addEventListener("pointerdown", onPointerDown, capture);
    el.addEventListener("mousedown", stopNativeMoveStart, capture);
    el.addEventListener("touchstart", stopNativeMoveStart, capture);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown, capture);
      el.removeEventListener("mousedown", stopNativeMoveStart, capture);
      el.removeEventListener("touchstart", stopNativeMoveStart, capture);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endGesture);
      window.removeEventListener("pointercancel", endGesture);
      if (gesture) setCreateUiBlocksPan(false);
    };
  }, []);

  return (
    <button
      ref={handleRef}
      type="button"
      aria-label={ariaLabel}
      {...{ [dataAttr]: "" }}
      className="absolute right-0 bottom-0 z-[2] h-11 w-11 touch-none cursor-se-resize"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute right-1 bottom-1 h-2 w-2 border-r border-b border-neutral-400"
      />
    </button>
  );
}
