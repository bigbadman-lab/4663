"use client";

/**
 * COUNTDOWN V1 canvas object — live display is derived; config is persisted.
 */

import { CanMoveElement } from "@playhtml/react";
import { useEffect, useState, type ReactNode } from "react";
import { LabObjectColorPicker } from "@/components/modules/lab-object-color-picker";
import { LabResizeHandle } from "@/components/modules/lab-resize-handle";
import { PlayhtmlMoveHitFill } from "@/components/canvas/playhtml-move-hit-fill";
import { useInteractiveControlProtection } from "@/components/canvas/use-interactive-control-protection";
import { usePlayhtmlMoveForeground } from "@/components/canvas/use-playhtml-move-foreground";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/world-camera";
import { stopPlayhtmlMoveStart } from "@/lib/canvas/interactive-control";
import {
  labObjectColorVisual,
  type LabObjectColor,
} from "@/lib/modules/lab-object-color";
import type { LabObjectSize } from "@/lib/modules/lab-object-size";
import {
  COUNTDOWN_LABEL_MAX_LENGTH,
  COUNTDOWN_SIZE_LIMITS,
  countdownParts,
  formatCountdownDays,
  formatCountdownHms,
  formatCountdownTarget,
  isoToLocalDateTime,
  playhtmlCountdownElementId,
  type CountdownInstance,
} from "@/modules/organise/countdown/countdown-state";

export type CountdownObjectViewProps = {
  countdown: CountdownInstance;
  onLabelChange: (countdownId: string, label: string) => void;
  onLocalDateTimeChange: (
    countdownId: string,
    date: string,
    time: string,
  ) => void;
  onColorChange: (countdownId: string, color: LabObjectColor) => void;
  onResize: (countdownId: string, size: LabObjectSize) => void;
  onDelete: (countdownId: string) => void;
};

function useNowMs(intervalMs: number = 1000): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return nowMs;
}

function CompactButton({
  label,
  onClick,
  testId,
  muted,
  children,
}: {
  label: string;
  onClick: () => void;
  testId: string;
  muted: string;
  children: string;
}) {
  const ref = useInteractiveControlProtection<HTMLButtonElement>();
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      data-4663-countdown-control={testId}
      className="touch-manipulation font-mono text-[10px] tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
      style={{ color: muted }}
      onPointerDown={stopPlayhtmlMoveStart}
      onMouseDown={stopPlayhtmlMoveStart}
      onTouchStart={stopPlayhtmlMoveStart}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function CountdownField({
  label,
  children,
  muted,
}: {
  label: string;
  children: ReactNode;
  muted: string;
}) {
  return (
    <label className="relative z-[1] flex min-h-8 flex-col gap-0.5">
      <span
        className="font-mono text-[10px] tracking-wide"
        style={{ color: muted }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

export function CountdownObjectView({
  countdown,
  onLabelChange,
  onLocalDateTimeChange,
  onColorChange,
  onResize,
  onDelete,
}: CountdownObjectViewProps) {
  const move = usePlayhtmlMoveForeground<HTMLDivElement>();
  const visual = labObjectColorVisual(countdown.color);
  const nowMs = useNowMs();
  const [editing, setEditing] = useState(false);
  const targetMs = Date.parse(countdown.targetAt);
  const parts = countdownParts(targetMs, nowMs);
  const local = isoToLocalDateTime(countdown.targetAt);
  const labelRef = useInteractiveControlProtection<HTMLInputElement>();
  const dateRef = useInteractiveControlProtection<HTMLInputElement>();
  const timeRef = useInteractiveControlProtection<HTMLInputElement>();

  return (
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
      <div
        id={playhtmlCountdownElementId(countdown.id)}
        className="pointer-events-auto absolute z-[16] cursor-grab touch-manipulation select-none active:cursor-grabbing"
        style={{
          left: `${countdown.leftPct}%`,
          top: `${countdown.topPct}%`,
          width: `${countdown.widthPct}%`,
          height: `${countdown.heightPct}%`,
        }}
        data-4663-countdown={countdown.id}
        onPointerDown={move.onPointerDown}
        onPointerUp={move.onPointerUp}
        onPointerCancel={move.onPointerCancel}
      >
        <div
          className="relative flex h-full w-full flex-col border px-2 pb-2 pt-1.5"
          style={{
            backgroundColor: visual.background,
            borderColor: visual.border,
            color: visual.foreground,
          }}
        >
          <PlayhtmlMoveHitFill />
          {/* z-[5] so overflowing colour swatches stack above the body (z-[1]). */}
          <div className="relative z-[5] flex shrink-0 items-center justify-between gap-2">
            <span
              className="font-mono text-[10px] tracking-wide"
              style={{ color: visual.muted }}
              data-4663-countdown-chrome-label
            >
              COUNTDOWN
            </span>
            <div className="flex items-center gap-0.5">
              <CompactButton
                label={editing ? "Done editing" : "Edit countdown"}
                testId="edit"
                muted={visual.muted}
                onClick={() => setEditing((open) => !open)}
              >
                {editing ? "[ DONE ]" : "[ EDIT ]"}
              </CompactButton>
              <LabObjectColorPicker
                value={countdown.color}
                onChange={(color) => onColorChange(countdown.id, color)}
              />
              <CompactButton
                label="Delete countdown"
                testId="delete"
                muted={visual.muted}
                onClick={() => onDelete(countdown.id)}
              >
                [ × ]
              </CompactButton>
            </div>
          </div>
          {editing ? (
            <div
              className="relative z-[1] flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto"
              data-4663-countdown-edit
            >
              <CountdownField label="LABEL" muted={visual.muted}>
                <input
                  ref={labelRef}
                  value={countdown.label}
                  maxLength={COUNTDOWN_LABEL_MAX_LENGTH}
                  spellCheck={false}
                  aria-label="Countdown label"
                  placeholder="LAUNCH"
                  data-4663-countdown-label
                  data-4663-countdown-editor=""
                  className="min-h-8 w-full bg-transparent font-mono text-[11px] tracking-wide outline-none placeholder:opacity-50"
                  style={{ color: visual.foreground }}
                  onPointerDown={stopPlayhtmlMoveStart}
                  onMouseDown={stopPlayhtmlMoveStart}
                  onTouchStart={stopPlayhtmlMoveStart}
                  onChange={(event) =>
                    onLabelChange(countdown.id, event.target.value)
                  }
                />
              </CountdownField>
              <CountdownField label="DATE" muted={visual.muted}>
                <input
                  ref={dateRef}
                  type="date"
                  value={local.date}
                  aria-label="Countdown date"
                  data-4663-countdown-date
                  data-4663-countdown-editor=""
                  className="min-h-8 w-full bg-transparent font-mono text-[11px] tracking-wide outline-none"
                  style={{ color: visual.foreground }}
                  onPointerDown={stopPlayhtmlMoveStart}
                  onMouseDown={stopPlayhtmlMoveStart}
                  onTouchStart={stopPlayhtmlMoveStart}
                  onChange={(event) =>
                    onLocalDateTimeChange(
                      countdown.id,
                      event.target.value,
                      local.time,
                    )
                  }
                />
              </CountdownField>
              <CountdownField label="TIME" muted={visual.muted}>
                <input
                  ref={timeRef}
                  type="time"
                  value={local.time}
                  step={60}
                  aria-label="Countdown time"
                  data-4663-countdown-time
                  data-4663-countdown-editor=""
                  className="min-h-8 w-full bg-transparent font-mono text-[11px] tracking-wide outline-none"
                  style={{ color: visual.foreground }}
                  onPointerDown={stopPlayhtmlMoveStart}
                  onMouseDown={stopPlayhtmlMoveStart}
                  onTouchStart={stopPlayhtmlMoveStart}
                  onChange={(event) =>
                    onLocalDateTimeChange(
                      countdown.id,
                      local.date,
                      event.target.value,
                    )
                  }
                />
              </CountdownField>
            </div>
          ) : (
            <div
              className="relative z-[1] flex min-h-0 flex-1 flex-col justify-center"
              data-4663-countdown-display
            >
              {countdown.label ? (
                <div
                  className="font-mono text-[12px] tracking-wide"
                  data-4663-countdown-title
                >
                  {countdown.label}
                </div>
              ) : null}
              <div
                className="mt-1 font-mono text-[11px] tracking-wide"
                data-4663-countdown-days
              >
                {formatCountdownDays(parts.days)}
              </div>
              <div
                className="font-mono text-[18px] leading-none tracking-wide"
                data-4663-countdown-hms
              >
                {formatCountdownHms(parts)}
              </div>
              <div
                className="mt-2 font-mono text-[10px] tracking-wide"
                style={{ color: visual.muted }}
                data-4663-countdown-status
              >
                {parts.expired
                  ? "COMPLETE"
                  : formatCountdownTarget(countdown.targetAt)}
              </div>
            </div>
          )}
          <LabResizeHandle
            hostSelector="[data-4663-countdown]"
            editorSelector="[data-4663-countdown-editor]"
            size={{
              widthPct: countdown.widthPct,
              heightPct: countdown.heightPct,
            }}
            limits={COUNTDOWN_SIZE_LIMITS}
            onResize={(size) => onResize(countdown.id, size)}
            ariaLabel="Resize countdown"
            dataAttr="data-4663-countdown-resize"
          />
        </div>
      </div>
    </CanMoveElement>
  );
}
