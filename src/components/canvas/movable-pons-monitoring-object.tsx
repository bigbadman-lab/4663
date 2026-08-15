"use client";

/**
 * PlayHTML-movable wrapper for the single PONS monitoring object.
 * Import only under PlayProvider.
 */

import { CanMoveElement } from "@playhtml/react";
import {
  PONS_MONITORING_DEFAULT_STYLE,
  PONS_MONITORING_ELEMENT_ID,
  PonsMonitoringContent,
  ponsMonitoringHostClassName,
} from "@/components/canvas/pons-monitoring-object";
import { usePlayhtmlMoveForeground } from "@/components/canvas/use-playhtml-move-foreground";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/hero";

export function MovablePonsMonitoringObject() {
  const move = usePlayhtmlMoveForeground<HTMLDivElement>();
  return (
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
      <div
        id={PONS_MONITORING_ELEMENT_ID}
        className={ponsMonitoringHostClassName(true)}
        style={PONS_MONITORING_DEFAULT_STYLE}
        data-4663-pons-monitoring
        onPointerDown={move.onPointerDown}
        onPointerUp={move.onPointerUp}
        onPointerCancel={move.onPointerCancel}
      >
        <div className="-translate-x-1/2 -translate-y-1/2">
          <PonsMonitoringContent />
        </div>
      </div>
    </CanMoveElement>
  );
}
