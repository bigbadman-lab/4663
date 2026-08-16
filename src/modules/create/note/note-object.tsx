"use client";

/**
 * NOTE V1 canvas object — PlayHTML-movable; textarea/resize are not drag handles.
 */

import { CanMoveElement } from "@playhtml/react";
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
import {
  NOTE_MAX_CONTENT_LENGTH,
  NOTE_SIZE_LIMITS,
  playhtmlNoteElementId,
  type NoteInstance,
  type NoteSize,
} from "@/modules/create/note/note-state";

export type NoteObjectViewProps = {
  note: NoteInstance;
  onContentChange: (noteId: string, content: string) => void;
  onColorChange: (noteId: string, color: LabObjectColor) => void;
  onResize: (noteId: string, size: NoteSize) => void;
  onDelete: (noteId: string) => void;
};

function NoteDeleteButton({
  noteId,
  muted,
  onDelete,
}: {
  noteId: string;
  muted: string;
  onDelete: (noteId: string) => void;
}) {
  const ref = useInteractiveControlProtection<HTMLButtonElement>();
  return (
    <button
      ref={ref}
      type="button"
      className="touch-manipulation font-mono text-[10px] tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
      style={{ color: muted }}
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
  foreground,
  onContentChange,
}: {
  noteId: string;
  content: string;
  foreground: string;
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
      className="relative z-[1] min-h-0 w-full flex-1 resize-none cursor-text bg-transparent font-mono text-[12px] leading-snug tracking-wide outline-none placeholder:opacity-50"
      style={{ color: foreground }}
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

export function NoteObjectView({
  note,
  onContentChange,
  onColorChange,
  onResize,
  onDelete,
}: NoteObjectViewProps) {
  const move = usePlayhtmlMoveForeground<HTMLDivElement>();
  const adopt = useLabBoardAdoption(note.id, note.boardId, move);
  const visual = labObjectColorVisual(note.color);

  return (
    <LabBoardCarryFrame boardId={note.boardId}>
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
        data-4663-owned-by={note.boardId ?? undefined}
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
          {/* z-[5] so overflowing colour swatches stack above the editor (z-[1]). */}
          <div className="relative z-[5] flex shrink-0 items-center justify-between gap-2">
            <span
              className="font-mono text-[10px] tracking-wide"
              style={{ color: visual.muted }}
              data-4663-note-label
            >
              NOTE
            </span>
            <div className="flex items-center gap-0.5">
              <LabObjectColorPicker
                value={note.color}
                onChange={(color) => onColorChange(note.id, color)}
              />
              <NoteDeleteButton
                noteId={note.id}
                muted={visual.muted}
                onDelete={onDelete}
              />
            </div>
          </div>
          <NoteEditor
            noteId={note.id}
            content={note.content}
            foreground={visual.foreground}
            onContentChange={onContentChange}
          />
          <LabResizeHandle
            hostSelector="[data-4663-note]"
            editorSelector="[data-4663-note-editor]"
            size={{ widthPct: note.widthPct, heightPct: note.heightPct }}
            limits={NOTE_SIZE_LIMITS}
            onResize={(size) => onResize(note.id, size)}
            ariaLabel="Resize note"
            dataAttr="data-4663-note-resize"
          />
        </div>
      </div>
    </CanMoveElement>
    </LabBoardCarryFrame>
  );
}
