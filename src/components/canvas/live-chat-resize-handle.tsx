"use client";

/**
 * Desktop-only bottom-right resize for the live chat panel.
 * Native capture listeners — do not use useInteractiveControlProtection here.
 * Compact/touch layouts must not mount this control.
 */

import { useEffect, useRef } from "react";
import {
  getCanvasPlacementSnapshot,
  setCreateUiBlocksPan,
} from "@/components/canvas/use-canvas-camera";
import { isUsableCanvasPointer } from "@/lib/canvas/canvas-pan-gesture";
import {
  beginLiveChatResize,
  finishLiveChatResize,
  moveLiveChatResize,
  writeLiveChatSize,
  type LiveChatResizeGesture,
  type LiveChatSize,
  type LiveChatViewport,
} from "@/lib/social/live-chat-size";

export type LiveChatResizeHandleProps = {
  size: LiveChatSize;
  onResize: (size: LiveChatSize) => void;
  viewport: () => LiveChatViewport;
};

function stopNativeMoveStart(event: Event): void {
  event.stopPropagation();
}

export function LiveChatResizeHandle({
  size,
  onResize,
  viewport,
}: LiveChatResizeHandleProps) {
  const handleRef = useRef<HTMLButtonElement | null>(null);
  const sizeRef = useRef(size);
  const onResizeRef = useRef(onResize);
  const viewportRef = useRef(viewport);

  useEffect(() => {
    sizeRef.current = size;
    onResizeRef.current = onResize;
    viewportRef.current = viewport;
  }, [size, onResize, viewport]);

  useEffect(() => {
    const el = handleRef.current;
    if (!el) return;

    let gesture: LiveChatResizeGesture | null = null;

    const persist = (next: LiveChatSize) => {
      onResizeRef.current(next);
      writeLiveChatSize(next, window.sessionStorage, viewportRef.current());
    };

    const cameraScale = (): number =>
      getCanvasPlacementSnapshot()?.camera.scale ?? 1;

    const onPointerMove = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const next = moveLiveChatResize(gesture, {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        scale: cameraScale(),
        viewport: viewportRef.current(),
      });
      if (!next) return;
      gesture = next;
      persist(next.size);
    };

    const endGesture = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const next = finishLiveChatResize(gesture, {
        type: event.type,
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        scale: cameraScale(),
        viewport: viewportRef.current(),
      });
      gesture = null;
      persist(next);
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

      gesture = beginLiveChatResize({
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        size: sizeRef.current,
        viewport: viewportRef.current(),
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
      if (gesture) setCreateUiBlocksPan(false);
    };
  }, []);

  return (
    <button
      ref={handleRef}
      type="button"
      aria-label="Resize chat"
      data-4663-live-chat-resize
      className="absolute right-0 bottom-0 z-[2] hidden h-8 w-8 touch-none cursor-se-resize desktop-chrome:block"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute right-1.5 bottom-1.5 h-2 w-2 border-r border-b border-neutral-400"
      />
    </button>
  );
}
