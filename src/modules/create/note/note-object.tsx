"use client";

/**
 * NOTE V1 canvas object — PlayHTML-movable; textarea/resize are not drag handles.
 */

import { CanMoveElement } from "@playhtml/react";
import { useEffect, useRef } from "react";
import { PlayhtmlMoveHitFill } from "@/components/canvas/playhtml-move-hit-fill";
import { useInteractiveControlProtection } from "@/components/canvas/use-interactive-control-protection";
import {
  getCanvasPlacementSnapshot,
  setCreateUiBlocksPan,
} from "@/components/canvas/use-canvas-camera";
import { usePlayhtmlMoveForeground } from "@/components/canvas/use-playhtml-move-foreground";
import {
  PLAYHTML_CANVAS_BOUNDS_ID,
  WORLD_HEIGHT_PX,
  WORLD_WIDTH_PX,
  screenPointToWorldPoint,
} from "@/lib/canvas/world-camera";
import { stopPlayhtmlMoveStart } from "@/lib/canvas/interactive-control";
import {
  applyNoteResize,
  NOTE_MAX_CONTENT_LENGTH,
  playhtmlNoteElementId,
  worldDeltaToNoteSizePct,
  type NoteInstance,
  type NoteSize,
} from "@/modules/create/note/note-state";

export type NoteObjectViewProps = {
  note: NoteInstance;
  onContentChange: (noteId: string, content: string) => void;
  onResize: (noteId: string, size: NoteSize) => void;
  onDelete: (noteId: string) => void;
};

function NoteDeleteButton({
  noteId,
  onDelete,
}: {
  noteId: string;
  onDelete: (noteId: string) => void;
}) {
  const ref = useInteractiveControlProtection<HTMLButtonElement>();
  return (
    <button
      ref={ref}
      type="button"
      className="touch-manipulation font-mono text-[10px] tracking-wide text-neutral-400 hover:text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
      data-4663-note-delete
      aria-label="Delete note"
      onPointerDown={stopPlayhtmlMoveStart}
      onMouseDown={stopPlayhtmlMoveStart}
      onTouchStart={stopPlayhtmlMoveStart}
      onClick={(event) => {
        event.stopPropagation();
        onDelete(noteId);
      }}
    >
      [ × ]
    </button>
  );
}

function NoteEditor({
  noteId,
  content,
  onContentChange,
}: {
  noteId: string;
  content: string;
  onContentChange: (noteId: string, content: string) => void;
}) {
  const ref = useInteractiveControlProtection<HTMLTextAreaElement>();
  return (
    <textarea
      ref={ref}
      value={content}
      maxLength={NOTE_MAX_CONTENT_LENGTH}
      spellCheck={false}
      aria-label="Note"
      data-4663-note-editor
      className="relative z-[1] min-h-0 w-full flex-1 resize-none cursor-text bg-transparent font-mono text-[12px] leading-snug tracking-wide text-[color:var(--canvas-fg,#171717)] outline-none placeholder:text-neutral-400"
      placeholder="…"
      onPointerDown={stopPlayhtmlMoveStart}
      onMouseDown={stopPlayhtmlMoveStart}
      onTouchStart={stopPlayhtmlMoveStart}
      onChange={(event) => {
        onContentChange(noteId, event.target.value);
      }}
    />
  );
}

type NoteResizeGesture = {
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

/**
 * Resize owns pointerdown/move itself.
 * `useInteractiveControlProtection` capture-stops pointerdown before React
 * handlers run (that helper is for click-owned controls). Native capture
 * listeners both isolate PlayHTML and drive the gesture.
 */
function NoteResizeHandle({
  note,
  onResize,
}: {
  note: NoteInstance;
  onResize: (noteId: string, size: NoteSize) => void;
}) {
  const handleRef = useRef<HTMLButtonElement | null>(null);
  const noteRef = useRef(note);
  const onResizeRef = useRef(onResize);

  useEffect(() => {
    noteRef.current = note;
    onResizeRef.current = onResize;
  }, [note, onResize]);

  useEffect(() => {
    const el = handleRef.current;
    if (!el) return;

    let gesture: NoteResizeGesture | null = null;

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
      const delta = worldDeltaToNoteSizePct(next.x - start.x, next.y - start.y);
      const current = noteRef.current;
      onResizeRef.current(
        current.id,
        applyNoteResize({
          widthPct: gesture.widthPct,
          heightPct: gesture.heightPct,
          originLeftPct: gesture.originLeftPct,
          originTopPct: gesture.originTopPct,
          deltaWidthPct: delta.deltaWidthPct,
          deltaHeightPct: delta.deltaHeightPct,
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

      const host = el.closest("[data-4663-note]");
      const snapshot = getCanvasPlacementSnapshot();
      if (!(host instanceof HTMLElement) || snapshot == null) return;

      const current = noteRef.current;
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        const editor = host.querySelector("[data-4663-note-editor]");
        if (active === editor) active.blur();
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
      aria-label="Resize note"
      data-4663-note-resize
      className="absolute right-0 bottom-0 z-[2] h-11 w-11 touch-none cursor-se-resize"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute right-1 bottom-1 h-2 w-2 border-r border-b border-neutral-400"
        data-4663-note-resize-mark
      />
    </button>
  );
}

export function NoteObjectView({
  note,
  onContentChange,
  onResize,
  onDelete,
}: NoteObjectViewProps) {
  const move = usePlayhtmlMoveForeground<HTMLDivElement>();

  return (
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
      <div
        id={playhtmlNoteElementId(note.id)}
        className="pointer-events-auto absolute z-[16] cursor-grab touch-manipulation select-none active:cursor-grabbing"
        style={{
          left: `${note.leftPct}%`,
          top: `${note.topPct}%`,
          width: `${note.widthPct}%`,
          height: `${note.heightPct}%`,
        }}
        data-4663-note={note.id}
        onPointerDown={move.onPointerDown}
        onPointerUp={move.onPointerUp}
        onPointerCancel={move.onPointerCancel}
      >
        <div className="relative flex h-full w-full flex-col border border-neutral-300 bg-white/95 px-2 pb-2 pt-1.5">
          <PlayhtmlMoveHitFill />
          <div className="relative z-[1] flex shrink-0 items-center justify-between gap-2">
            <span
              className="font-mono text-[10px] tracking-wide text-neutral-400"
              data-4663-note-label
            >
              NOTE
            </span>
            <NoteDeleteButton noteId={note.id} onDelete={onDelete} />
          </div>
          <NoteEditor
            noteId={note.id}
            content={note.content}
            onContentChange={onContentChange}
          />
          <NoteResizeHandle note={note} onResize={onResize} />
        </div>
      </div>
    </CanMoveElement>
  );
}
