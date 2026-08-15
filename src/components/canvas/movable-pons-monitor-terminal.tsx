"use client";

/**
 * PlayHTML-movable wrapper for the live PONS monitoring terminal.
 * Import only under PlayProvider.
 */

import { CanMoveElement } from "@playhtml/react";
import {
  PONS_MONITOR_TERMINAL_DEFAULT_STYLE,
  PONS_MONITOR_TERMINAL_ELEMENT_ID,
  PonsMonitorTerminalContent,
  ponsMonitorTerminalHostClassName,
} from "@/components/canvas/pons-monitor-terminal";
import { usePlayhtmlMoveForeground } from "@/components/canvas/use-playhtml-move-foreground";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/hero";

export function MovablePonsMonitorTerminal() {
  const move = usePlayhtmlMoveForeground<HTMLDivElement>();
  return (
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
      <div
        id={PONS_MONITOR_TERMINAL_ELEMENT_ID}
        className={ponsMonitorTerminalHostClassName(true)}
        style={PONS_MONITOR_TERMINAL_DEFAULT_STYLE}
        data-4663-pons-monitor-terminal-host
        onPointerDown={move.onPointerDown}
        onPointerUp={move.onPointerUp}
        onPointerCancel={move.onPointerCancel}
      >
        <div className="-translate-x-1/2 -translate-y-1/2">
          <PonsMonitorTerminalContent />
        </div>
      </div>
    </CanMoveElement>
  );
}
