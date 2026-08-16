"use client";

/**
 * BOARD V1 canvas object — soft container chrome. Children stay world siblings.
 */

import { CanMoveElement } from "@playhtml/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { LabObjectColorPicker } from "@/components/modules/lab-object-color-picker";
import { LabResizeHandle } from "@/components/modules/lab-resize-handle";
import {
  clientRectToWorldRect,
  nudgeOwnedChildrenBelowBoardChrome,
  useLabBoardAccepting,
  useLabBoardCarryApi,
} from "@/components/modules/lab-board-ui";
import { PlayhtmlMoveHitFill } from "@/components/canvas/playhtml-move-hit-fill";
import { useInteractiveControlProtection } from "@/components/canvas/use-interactive-control-protection";
import {
  capturePlayhtmlMovePointer,
  releasePlayhtmlMovePointer,
  shouldBeginPlayhtmlMoveForeground,
} from "@/lib/canvas/playhtml-move-interaction";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/world-camera";
import { stopPlayhtmlMoveStart } from "@/lib/canvas/interactive-control";
import {
  shiftOwnedLabBoardChildren,
} from "@/lib/modules/lab-board-bridge";
import { worldDeltaPxToOriginPct } from "@/lib/modules/lab-board-containment";
import {
  labObjectColorVisual,
  type LabObjectColor,
} from "@/lib/modules/lab-object-color";
import type { LabObjectSize } from "@/lib/modules/lab-object-size";
import {
  BOARD_SIZE_LIMITS,
  BOARD_TITLE_MAX_LENGTH,
  playhtmlBoardElementId,
  type BoardInstance,
} from "@/modules/organise/board/board-state";

export type BoardObjectViewProps = {
  board: BoardInstance;
  onTitleChange: (boardId: string, title: string) => void;
  onColorChange: (boardId: string, color: LabObjectColor) => void;
  onResize: (boardId: string, size: LabObjectSize) => void;
  onDelete: (boardId: string) => void;
};

function hexToRgba(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function BoardDeleteButton({
  boardId,
  muted,
  onDelete,
}: {
  boardId: string;
  muted: string;
  onDelete: (boardId: string) => void;
}) {
  const ref = useInteractiveControlProtection<HTMLButtonElement>();
  return (
    <button
      ref={ref}
      type="button"
      className="touch-manipulation font-mono text-[10px] tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
      style={{ color: muted }}
      data-4663-board-delete
      aria-label="Delete board"
      onPointerDown={stopPlayhtmlMoveStart}
      onMouseDown={stopPlayhtmlMoveStart}
      onTouchStart={stopPlayhtmlMoveStart}
      onClick={(event) => {
        event.stopPropagation();
        onDelete(boardId);
      }}
    >
      [ × ]
    </button>
  );
}

function BoardChromeTitle({
  boardId,
  title,
  foreground,
  onTitleChange,
}: {
  boardId: string;
  title: string;
  foreground: string;
  onTitleChange: (boardId: string, title: string) => void;
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
    onTitleChange(boardId, draft);
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
        aria-label="Edit board title"
        data-4663-board-title
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
        maxLength={BOARD_TITLE_MAX_LENGTH}
        spellCheck={false}
        aria-label="Board title"
        data-4663-board-title-editor=""
        data-4663-board-editor=""
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

export function BoardObjectView({
  board,
  onTitleChange,
  onColorChange,
  onResize,
  onDelete,
}: BoardObjectViewProps) {
  const visual = labObjectColorVisual(board.color);
  const accepting = useLabBoardAccepting(board.id);
  const { setBoardCarry } = useLabBoardCarryApi();
  const gestureRef = useRef<{
    pointerId: number;
    startLeft: number;
    startTop: number;
  } | null>(null);
  const detachRef = useRef<(() => void) | null>(null);

  const stopWindow = useCallback(() => {
    detachRef.current?.();
    detachRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopWindow();
      setBoardCarry(board.id, null);
    };
  }, [board.id, setBoardCarry, stopWindow]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!shouldBeginPlayhtmlMoveForeground(event.target)) return;
      if (event.button !== 0 && event.pointerType === "mouse") return;
      capturePlayhtmlMovePointer(event.currentTarget, event.pointerId);
      stopWindow();
      const startRect = clientRectToWorldRect(
        event.currentTarget.getBoundingClientRect(),
      );
      if (startRect == null) return;
      const pointerId = event.pointerId;
      const host = event.currentTarget;
      gestureRef.current = {
        pointerId,
        startLeft: startRect.left,
        startTop: startRect.top,
      };

      const readDelta = () => {
        const gesture = gestureRef.current;
        const now = clientRectToWorldRect(host.getBoundingClientRect());
        if (gesture == null || now == null) return { x: 0, y: 0 };
        return {
          x: now.left - gesture.startLeft,
          y: now.top - gesture.startTop,
        };
      };

      const onMove = (native: PointerEvent) => {
        const gesture = gestureRef.current;
        if (gesture == null || gesture.pointerId !== native.pointerId) return;
        setBoardCarry(board.id, readDelta());
      };
      const end = (native: PointerEvent) => {
        const gesture = gestureRef.current;
        if (gesture == null || gesture.pointerId !== native.pointerId) return;
        gestureRef.current = null;
        stopWindow();
        releasePlayhtmlMovePointer(host, native.pointerId);
        requestAnimationFrame(() => {
          const now = clientRectToWorldRect(host.getBoundingClientRect());
          const dx = now != null ? now.left - gesture.startLeft : 0;
          const dy = now != null ? now.top - gesture.startTop : 0;
          const origin = worldDeltaPxToOriginPct(dx, dy);
          setBoardCarry(board.id, null);
          shiftOwnedLabBoardChildren(
            board.id,
            origin.deltaLeftPct,
            origin.deltaTopPct,
          );
        });
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
      detachRef.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
      };
    },
    [board.id, setBoardCarry, stopWindow],
  );

  const fill = hexToRgba(visual.background, accepting ? 0.72 : 0.48);
  const border = accepting ? visual.foreground : visual.border;

  return (
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
      <div
        id={playhtmlBoardElementId(board.id)}
        className="pointer-events-auto absolute z-[8] cursor-grab touch-manipulation select-none active:cursor-grabbing"
        style={{
          left: `${board.leftPct}%`,
          top: `${board.topPct}%`,
          width: `${board.widthPct}%`,
          height: `${board.heightPct}%`,
        }}
        data-4663-board={board.id}
        data-4663-board-accepting={accepting ? "true" : undefined}
        onPointerDown={onPointerDown}
      >
        <div
          className="relative flex h-full w-full flex-col border px-2 pb-2 pt-1.5"
          style={{
            backgroundColor: fill,
            borderColor: border,
            borderWidth: accepting ? 2 : 1,
            color: visual.foreground,
            boxShadow: accepting
              ? `inset 0 0 0 1px ${hexToRgba(visual.foreground, 0.18)}`
              : undefined,
          }}
        >
          <PlayhtmlMoveHitFill />
          <div
            className="relative z-[5] flex shrink-0 items-center justify-between gap-2 border-b pb-1"
            style={{ borderColor: visual.border }}
            data-4663-board-chrome
          >
            <BoardChromeTitle
              boardId={board.id}
              title={board.title}
              foreground={visual.foreground}
              onTitleChange={onTitleChange}
            />
            <div className="flex shrink-0 items-center gap-0.5">
              <LabObjectColorPicker
                value={board.color}
                onChange={(color) => onColorChange(board.id, color)}
              />
              <BoardDeleteButton
                boardId={board.id}
                muted={visual.muted}
                onDelete={onDelete}
              />
            </div>
          </div>
          <LabResizeHandle
            hostSelector="[data-4663-board]"
            editorSelector="[data-4663-board-editor]"
            size={{ widthPct: board.widthPct, heightPct: board.heightPct }}
            limits={BOARD_SIZE_LIMITS}
            onResize={(size) => {
              onResize(board.id, size);
              requestAnimationFrame(() => {
                nudgeOwnedChildrenBelowBoardChrome(board.id);
              });
            }}
            ariaLabel="Resize board"
            dataAttr="data-4663-board-resize"
          />
        </div>
      </div>
    </CanMoveElement>
  );
}
