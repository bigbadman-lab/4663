"use client";

/**
 * CALENDAR V1 canvas object — local month grid with date-only events.
 */

import { CanMoveElement } from "@playhtml/react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { LabObjectColorPicker } from "@/components/modules/lab-object-color-picker";
import { LabResizeHandle } from "@/components/modules/lab-resize-handle";
import {
  LabBoardCarryFrame,
  useLabBoardAdoption,
} from "@/components/modules/lab-board-ui";
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
  calendarCellSelection,
  calendarMonthCells,
  calendarMonthTitle,
  CALENDAR_EVENT_TITLE_MAX_LENGTH,
  CALENDAR_MAX_EVENTS,
  CALENDAR_SIZE_LIMITS,
  CALENDAR_TITLE_MAX_LENGTH,
  CALENDAR_WEEKDAY_LABELS,
  defaultSelectedDate,
  eventCreateDate,
  localCalendarToday,
  localTodayString,
  playhtmlCalendarElementId,
  resolveCalendarDaySelection,
  visibleEventsForDate,
  type CalendarEvent,
  type CalendarInstance,
} from "@/modules/organise/calendar/calendar-state";

export type CalendarObjectViewProps = {
  calendar: CalendarInstance;
  onTitleChange: (calendarId: string, title: string) => void;
  onColorChange: (calendarId: string, color: LabObjectColor) => void;
  onViewShift: (calendarId: string, deltaMonths: number) => void;
  onAddEvent: (
    calendarId: string,
    input: { date: string; title: string },
  ) => void;
  onUpdateEvent: (
    calendarId: string,
    eventId: string,
    patch: { title?: string; date?: string },
  ) => void;
  onDeleteEvent: (calendarId: string, eventId: string) => void;
  onResize: (calendarId: string, size: LabObjectSize) => void;
  onDelete: (calendarId: string) => void;
};

type CalendarEditor =
  | { mode: "create"; date: string; title: string }
  | { mode: "edit"; eventId: string; date: string; title: string };

function hexToRgba(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function CalendarDeleteButton({
  calendarId,
  muted,
  onDelete,
}: {
  calendarId: string;
  muted: string;
  onDelete: (calendarId: string) => void;
}) {
  const ref = useInteractiveControlProtection<HTMLButtonElement>();
  return (
    <button
      ref={ref}
      type="button"
      className="touch-manipulation font-mono text-[10px] tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
      style={{ color: muted }}
      data-4663-calendar-delete
      aria-label="Delete calendar"
      onPointerDown={stopPlayhtmlMoveStart}
      onMouseDown={stopPlayhtmlMoveStart}
      onTouchStart={stopPlayhtmlMoveStart}
      onClick={(event) => {
        event.stopPropagation();
        onDelete(calendarId);
      }}
    >
      [ × ]
    </button>
  );
}

function CalendarChromeTitle({
  calendarId,
  title,
  foreground,
  onTitleChange,
}: {
  calendarId: string;
  title: string;
  foreground: string;
  onTitleChange: (calendarId: string, title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const displayRef = useInteractiveControlProtection<HTMLButtonElement>();
  const inputRef = useInteractiveControlProtection<HTMLInputElement>();
  const skipBlurCommit = useRef(false);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing, inputRef]);

  const commit = () => {
    if (skipBlurCommit.current) {
      skipBlurCommit.current = false;
      return;
    }
    onTitleChange(calendarId, draft);
    setEditing(false);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      skipBlurCommit.current = true;
      setDraft(title);
      setEditing(false);
    }
  };

  return (
    <div className="min-w-0 flex-1">
      <button
        ref={displayRef}
        type="button"
        aria-label="Edit calendar title"
        data-4663-calendar-title
        className={`min-h-7 w-full truncate bg-transparent text-left font-mono text-[11px] tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 ${
          editing ? "hidden" : "block"
        }`}
        style={{ color: foreground }}
        onPointerDown={stopPlayhtmlMoveStart}
        onMouseDown={stopPlayhtmlMoveStart}
        onTouchStart={stopPlayhtmlMoveStart}
        onClick={(event) => {
          event.stopPropagation();
          setDraft(title);
          setEditing(true);
        }}
      >
        {title}
      </button>
      <input
        ref={inputRef}
        value={draft}
        maxLength={CALENDAR_TITLE_MAX_LENGTH}
        spellCheck={false}
        aria-label="Calendar title"
        data-4663-calendar-title-editor=""
        data-4663-calendar-editor=""
        className={`min-h-7 w-full bg-transparent font-mono text-[11px] tracking-wide outline-none ${
          editing ? "block" : "hidden"
        }`}
        style={{ color: foreground }}
        onPointerDown={stopPlayhtmlMoveStart}
        onMouseDown={stopPlayhtmlMoveStart}
        onTouchStart={stopPlayhtmlMoveStart}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
    </div>
  );
}

function CompactControl({
  label,
  testId,
  muted,
  onClick,
  children,
}: {
  label: string;
  testId: string;
  muted: string;
  onClick: () => void;
  children: string;
}) {
  const ref = useInteractiveControlProtection<HTMLButtonElement>();
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      data-4663-calendar-control={testId}
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

function CalendarEventEditor({
  editor,
  foreground,
  muted,
  canSave,
  onTitleChange,
  onDateChange,
  onSave,
  onDelete,
  onCancel,
}: {
  editor: CalendarEditor;
  foreground: string;
  muted: string;
  canSave: boolean;
  onTitleChange: (title: string) => void;
  onDateChange: (date: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const titleRef = useInteractiveControlProtection<HTMLInputElement>();
  const dateRef = useInteractiveControlProtection<HTMLInputElement>();

  useEffect(() => {
    titleRef.current?.focus();
  }, [titleRef]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSave();
  };

  return (
    <form
      className="relative z-[1] mt-1 flex shrink-0 flex-col gap-1 border-t pt-1"
      data-4663-calendar-event-editor
      onSubmit={onSubmit}
      onPointerDown={stopPlayhtmlMoveStart}
      onMouseDown={stopPlayhtmlMoveStart}
      onTouchStart={stopPlayhtmlMoveStart}
    >
      <input
        ref={titleRef}
        value={editor.title}
        maxLength={CALENDAR_EVENT_TITLE_MAX_LENGTH}
        spellCheck={false}
        aria-label="Event title"
        placeholder="Event"
        data-4663-calendar-editor=""
        className="min-h-7 w-full bg-transparent font-mono text-[11px] tracking-wide outline-none placeholder:opacity-50"
        style={{ color: foreground }}
        onChange={(event) => onTitleChange(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-1">
        <input
          ref={dateRef}
          type="date"
          value={editor.date}
          aria-label="Event date"
          data-4663-calendar-editor=""
          className="min-h-7 bg-transparent font-mono text-[10px] tracking-wide outline-none"
          style={{ color: foreground }}
          onChange={(event) => onDateChange(event.target.value)}
        />
        <CompactControl
          label="Save event"
          testId="save-event"
          muted={muted}
          onClick={onSave}
        >
          {canSave ? "[ SAVE ]" : "[ FULL ]"}
        </CompactControl>
        {editor.mode === "edit" ? (
          <CompactControl
            label="Delete event"
            testId="delete-event"
            muted={muted}
            onClick={onDelete}
          >
            [ DEL ]
          </CompactControl>
        ) : null}
        <CompactControl
          label="Close event editor"
          testId="cancel-event"
          muted={muted}
          onClick={onCancel}
        >
          [ × ]
        </CompactControl>
      </div>
    </form>
  );
}

export function CalendarObjectView({
  calendar,
  onTitleChange,
  onColorChange,
  onViewShift,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  onResize,
  onDelete,
}: CalendarObjectViewProps) {
  const move = usePlayhtmlMoveForeground<HTMLDivElement>();
  const adopt = useLabBoardAdoption(calendar.id, calendar.boardId, move);
  const visual = labObjectColorVisual(calendar.color);
  const [editor, setEditor] = useState<CalendarEditor | null>(null);
  const today = localCalendarToday();
  const [selectedDate, setSelectedDate] = useState<string | null>(() =>
    defaultSelectedDate(calendar.viewYear, calendar.viewMonth, today),
  );
  const cells = calendarMonthCells(
    calendar.viewYear,
    calendar.viewMonth,
    today,
  );
  const atEventCap = calendar.events.length >= CALENDAR_MAX_EVENTS;

  const selectDay = (date: string) => {
    const next = resolveCalendarDaySelection({
      date,
      viewYear: calendar.viewYear,
      viewMonth: calendar.viewMonth,
    });
    if (next == null) return;
    setSelectedDate(next.selectedDate);
    if (next.viewDeltaMonths !== 0) {
      onViewShift(calendar.id, next.viewDeltaMonths);
    }
  };

  const openCreate = (date: string) => {
    selectDay(date);
    if (atEventCap) return;
    setEditor({ mode: "create", date, title: "" });
  };

  const openEdit = (event: CalendarEvent) => {
    selectDay(event.date);
    setEditor({
      mode: "edit",
      eventId: event.id,
      date: event.date,
      title: event.title,
    });
  };

  const saveEditor = () => {
    if (editor == null) return;
    if (editor.mode === "create") {
      if (atEventCap || editor.title.trim() === "") return;
      onAddEvent(calendar.id, { date: editor.date, title: editor.title });
      setEditor(null);
      return;
    }
    if (editor.title.trim() === "") return;
    onUpdateEvent(calendar.id, editor.eventId, {
      title: editor.title,
      date: editor.date,
    });
    setEditor(null);
  };

  return (
    <LabBoardCarryFrame boardId={calendar.boardId}>
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
      <div
        id={playhtmlCalendarElementId(calendar.id)}
        className="pointer-events-auto absolute z-[16] cursor-grab touch-manipulation select-none active:cursor-grabbing"
        style={{
          left: `${calendar.leftPct}%`,
          top: `${calendar.topPct}%`,
          width: `${calendar.widthPct}%`,
          height: `${calendar.heightPct}%`,
        }}
        data-4663-calendar={calendar.id}
        data-4663-owned-by={calendar.boardId ?? undefined}
        onPointerDown={adopt.onPointerDown}
        onPointerUp={adopt.onPointerUp}
        onPointerCancel={adopt.onPointerCancel}
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
          <div className="relative z-[5] flex shrink-0 items-center justify-between gap-2">
            <CalendarChromeTitle
              calendarId={calendar.id}
              title={calendar.title}
              foreground={visual.foreground}
              onTitleChange={onTitleChange}
            />
            <div className="flex shrink-0 items-center gap-0.5">
              <LabObjectColorPicker
                value={calendar.color}
                onChange={(color) => onColorChange(calendar.id, color)}
              />
              <CalendarDeleteButton
                calendarId={calendar.id}
                muted={visual.muted}
                onDelete={onDelete}
              />
            </div>
          </div>
          <div className="relative z-[1] mt-1 flex shrink-0 items-center justify-between gap-2">
            <span
              className="font-mono text-[11px] tracking-wide"
              style={{ color: visual.foreground }}
              data-4663-calendar-month
            >
              {calendarMonthTitle(calendar.viewYear, calendar.viewMonth)}
            </span>
            <div className="flex items-center gap-1">
              <CompactControl
                label="Previous month"
                testId="prev-month"
                muted={visual.muted}
                onClick={() => onViewShift(calendar.id, -1)}
              >
                [ &lt; ]
              </CompactControl>
              <CompactControl
                label="Next month"
                testId="next-month"
                muted={visual.muted}
                onClick={() => onViewShift(calendar.id, 1)}
              >
                [ &gt; ]
              </CompactControl>
            </div>
          </div>
          <div
            className="relative z-[1] mt-1 grid shrink-0 grid-cols-7 gap-px"
            data-4663-calendar-weekdays
          >
            {CALENDAR_WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="text-center font-mono text-[8px] tracking-wide"
                style={{ color: visual.muted }}
              >
                {label}
              </div>
            ))}
          </div>
          <div
            className="relative z-[1] mt-0.5 grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-px"
            data-4663-calendar-grid
          >
            {cells.map((cell) => {
              const { visible, overflow } = visibleEventsForDate(
                calendar.events,
                cell.date,
              );
              const selection = calendarCellSelection({
                cellDate: cell.date,
                inCurrentMonth: cell.inCurrentMonth,
                isToday: cell.isToday,
                selectedDate,
                viewYear: calendar.viewYear,
                viewMonth: calendar.viewMonth,
              });
              return (
                <div
                  key={cell.date}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selection.isSelected}
                  data-4663-interactive-control=""
                  data-4663-calendar-day={cell.date}
                  data-4663-calendar-today={selection.isToday ? "" : undefined}
                  data-4663-calendar-selected={
                    selection.isSelected ? "" : undefined
                  }
                  className="flex min-h-0 flex-col overflow-hidden px-0.5 py-0.5 font-mono"
                  style={{
                    color: cell.inCurrentMonth
                      ? visual.foreground
                      : visual.muted,
                    backgroundColor: selection.isSelected
                      ? hexToRgba(visual.foreground, 0.14)
                      : undefined,
                    boxShadow: selection.isSelected
                      ? `inset 0 0 0 2px ${visual.foreground}`
                      : selection.isToday
                        ? `inset 0 0 0 1.5px ${visual.foreground}`
                        : `inset 0 0 0 1px ${hexToRgba(visual.border, 0.7)}`,
                    opacity: cell.inCurrentMonth ? 1 : 0.55,
                  }}
                  onPointerDown={stopPlayhtmlMoveStart}
                  onMouseDown={stopPlayhtmlMoveStart}
                  onTouchStart={stopPlayhtmlMoveStart}
                  onClick={(event) => {
                    event.stopPropagation();
                    openCreate(cell.date);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    openCreate(cell.date);
                  }}
                >
                  <span className="text-[9px] leading-none">{cell.day}</span>
                  <div className="mt-0.5 flex min-h-0 flex-1 flex-col gap-px overflow-hidden">
                    {visible.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        data-4663-calendar-event={event.id}
                        className="w-full truncate text-left text-[8px] leading-tight tracking-wide"
                        style={{ color: visual.foreground }}
                        onPointerDown={stopPlayhtmlMoveStart}
                        onMouseDown={stopPlayhtmlMoveStart}
                        onTouchStart={stopPlayhtmlMoveStart}
                        onClick={(click) => {
                          click.stopPropagation();
                          openEdit(event);
                        }}
                      >
                        {event.title}
                      </button>
                    ))}
                    {overflow > 0 ? (
                      <span
                        className="text-[8px] leading-none"
                        style={{ color: visual.muted }}
                        data-4663-calendar-overflow
                      >
                        +{overflow}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="relative z-[1] mt-1 flex shrink-0 items-center justify-between">
            <CompactControl
              label="Add event"
              testId="add-event"
              muted={visual.muted}
              onClick={() =>
                openCreate(eventCreateDate(selectedDate, localTodayString()))
              }
            >
              [ + EVENT ]
            </CompactControl>
          </div>
          {editor != null ? (
            <CalendarEventEditor
              key={editor.mode === "edit" ? editor.eventId : "create"}
              editor={editor}
              foreground={visual.foreground}
              muted={visual.muted}
              canSave={editor.mode === "edit" || !atEventCap}
              onTitleChange={(title) => setEditor({ ...editor, title })}
              onDateChange={(date) => {
                setEditor({ ...editor, date });
                selectDay(date);
              }}
              onSave={saveEditor}
              onDelete={() => {
                if (editor.mode !== "edit") return;
                onDeleteEvent(calendar.id, editor.eventId);
                setEditor(null);
              }}
              onCancel={() => setEditor(null)}
            />
          ) : null}
          <LabResizeHandle
            hostSelector="[data-4663-calendar]"
            editorSelector="[data-4663-calendar-editor]"
            size={{
              widthPct: calendar.widthPct,
              heightPct: calendar.heightPct,
            }}
            limits={CALENDAR_SIZE_LIMITS}
            onResize={(size) => onResize(calendar.id, size)}
            ariaLabel="Resize calendar"
            dataAttr="data-4663-calendar-resize"
          />
        </div>
      </div>
    </CanMoveElement>
    </LabBoardCarryFrame>
  );
}
