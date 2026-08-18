"use client";

/**
 * PlayHTML-movable wrapper for the single PONS monitoring object.
 * Import only under PlayProvider.
 *
 * Centering translate lives on this host so the hittable box matches the
 * visible card (not an inner wrapper that leaves an empty host quadrant).
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
        <PonsMonitoringContent />
      </div>
    </CanMoveElement>
  );
}
