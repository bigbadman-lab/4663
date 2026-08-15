"use client";

/**
 * Session-only PlayHTML drag foreground + pointer capture.
 * Does not persist z-order. Does not start a drag on protected controls.
 *
 * Use event.currentTarget — CanMoveElement cloneElement-overwrites child refs.
 */

import { useCallback, type PointerEvent as ReactPointerEvent } from "react";
import {
  beginPlayhtmlMoveForeground,
  releasePlayhtmlMovePointer,
} from "@/lib/canvas/playhtml-move-interaction";

export function usePlayhtmlMoveForeground<T extends HTMLElement>() {
  const onPointerDown = useCallback((event: ReactPointerEvent<T>) => {
    beginPlayhtmlMoveForeground(event.currentTarget, {
      target: event.target,
      pointerId: event.pointerId,
    });
  }, []);

  const onPointerUp = useCallback((event: ReactPointerEvent<T>) => {
    releasePlayhtmlMovePointer(event.currentTarget, event.pointerId);
  }, []);

  const onPointerCancel = useCallback((event: ReactPointerEvent<T>) => {
    releasePlayhtmlMovePointer(event.currentTarget, event.pointerId);
  }, []);

  return { onPointerDown, onPointerUp, onPointerCancel };
}
