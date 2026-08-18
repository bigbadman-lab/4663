"use client";

/**
 * Bottom-right proportional resize for TEXT / DRAW canvas objects.
 * Native capture listeners — do not use useInteractiveControlProtection here.
 * Visual language matches Lab / live-chat L-corner handles.
 */

import { useEffect, useRef } from "react";
import {
  getCanvasPlacementSnapshot,
  setCreateUiBlocksPan,
} from "@/components/canvas/use-canvas-camera";
import { isUsableCanvasPointer } from "@/lib/canvas/canvas-pan-gesture";
import {
  beginObjectScaleResize,
  finishObjectScaleResize,
  moveObjectScaleResize,
  type ObjectScaleResizeGesture,
} from "@/lib/canvas/object-scale-resize";
import { screenPointToWorldPoint } from "@/lib/canvas/world-camera";

export type ObjectResizeHandleProps = {
  /** Unique object identity for this resize session. Defaults to hostSelector. */
  objectId?: string;
  /**
   * CSS selector for the PlayHTML host. Must be an attribute selector
   * (`[data-4663-…]`). `#4663-…` is not a valid CSS id selector because
   * the id starts with a digit. Must uniquely identify this object.
   */
  hostSelector: string;
  scale: number;
  minScale: number;
  maxScale: number;
  onResize: (scale: number) => void;
  ariaLabel: string;
  dataAttr: string;
  /** Defaults to the host bottom-right corner. */
  positionClassName?: string;
};

function stopNativeMoveStart(event: Event): void {
  event.stopPropagation();
}

export function ObjectResizeHandle({
  objectId,
  hostSelector,
  scale,
  minScale,
  maxScale,
  onResize,
  ariaLabel,
  dataAttr,
  positionClassName = "right-0 bottom-0",
}: ObjectResizeHandleProps) {
  const handleRef = useRef<HTMLButtonElement | null>(null);
  const scaleRef = useRef(scale);
  const minScaleRef = useRef(minScale);
  const maxScaleRef = useRef(maxScale);
  const onResizeRef = useRef(onResize);
  const hostSelectorRef = useRef(hostSelector);
  const objectIdRef = useRef(objectId ?? hostSelector);

  useEffect(() => {
    scaleRef.current = scale;
    minScaleRef.current = minScale;
    maxScaleRef.current = maxScale;
    onResizeRef.current = onResize;
    hostSelectorRef.current = hostSelector;
    objectIdRef.current = objectId ?? hostSelector;
  }, [scale, minScale, maxScale, onResize, hostSelector, objectId]);

  useEffect(() => {
    const el = handleRef.current;
    if (!el) return;

    let gesture: ObjectScaleResizeGesture | null = null;

    const worldDeltaFromClient = (clientX: number, clientY: number) => {
      const snapshot = getCanvasPlacementSnapshot();
      if (snapshot == null || !gesture) return null;
      const start = screenPointToWorldPoint(
        gesture.startClientX,
        gesture.startClientY,
        snapshot.viewport,
        snapshot.camera,
      );
      const next = screenPointToWorldPoint(
        clientX,
        clientY,
        snapshot.viewport,
        snapshot.camera,
      );
      return {
        deltaX: next.x - start.x,
        deltaY: next.y - start.y,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const delta = worldDeltaFromClient(event.clientX, event.clientY);
      if (!delta) return;
      const next = moveObjectScaleResize(gesture, {
        pointerId: event.pointerId,
        objectId: objectIdRef.current,
        deltaX: delta.deltaX,
        deltaY: delta.deltaY,
      });
      if (!next) return;
      gesture = next;
      onResizeRef.current(next.scale);
    };

    const endGesture = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const delta = worldDeltaFromClient(event.clientX, event.clientY);
      const nextScale = finishObjectScaleResize(gesture, {
        type: event.type,
        pointerId: event.pointerId,
        objectId: objectIdRef.current,
        deltaX: delta?.deltaX ?? 0,
        deltaY: delta?.deltaY ?? 0,
      });
      gesture = null;
      onResizeRef.current(nextScale);
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
      if (!isUsableCanvasPointer(event)) return;
      event.preventDefault();

      let host: Element | null = null;
      try {
        host = el.closest(hostSelectorRef.current);
      } catch {
        return;
      }
      const snapshot = getCanvasPlacementSnapshot();
      if (!(host instanceof HTMLElement) || snapshot == null) return;

      const rect = host.getBoundingClientRect();
      const origin = screenPointToWorldPoint(
        rect.left,
        rect.top,
        snapshot.viewport,
        snapshot.camera,
      );
      const corner = screenPointToWorldPoint(
        rect.right,
        rect.bottom,
        snapshot.viewport,
        snapshot.camera,
      );

      gesture = beginObjectScaleResize({
        pointerId: event.pointerId,
        objectId: objectIdRef.current,
        clientX: event.clientX,
        clientY: event.clientY,
        scale: scaleRef.current,
        widthPx: Math.max(1e-6, corner.x - origin.x),
        heightPx: Math.max(1e-6, corner.y - origin.y),
        minScale: minScaleRef.current,
        maxScale: maxScaleRef.current,
      });

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
      if (gesture) {
        setCreateUiBlocksPan(false);
        try {
          if (el.hasPointerCapture(gesture.pointerId)) {
            el.releasePointerCapture(gesture.pointerId);
          }
        } catch {
          // element already gone
        }
      }
    };
  }, []);

  return (
    <button
      ref={handleRef}
      type="button"
      aria-label={ariaLabel}
      data-4663-resize-object={objectId ?? hostSelector}
      {...{ [dataAttr]: objectId ?? "" }}
      className={`absolute z-[2] h-7 w-7 touch-none cursor-nwse-resize ${positionClassName}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute right-1 bottom-1 h-2 w-2 border-r border-b border-neutral-400"
      />
    </button>
  );
}
