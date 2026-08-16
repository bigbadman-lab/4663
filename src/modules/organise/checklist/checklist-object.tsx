"use client";

/**
 * CHECKLIST V1 canvas object — movable/resizable; inputs are not drag handles.
 */

import { CanMoveElement } from "@playhtml/react";
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
  type LabObjectColorVisual,
} from "@/lib/modules/lab-object-color";
import type { LabObjectSize } from "@/lib/modules/lab-object-size";
import {
  CHECKLIST_ITEM_MAX_LENGTH,
  CHECKLIST_SIZE_LIMITS,
  CHECKLIST_TITLE_MAX_LENGTH,
  canAddChecklistItem,
  playhtmlChecklistElementId,
  type ChecklistInstance,
  type ChecklistItem,
} from "@/modules/organise/checklist/checklist-state";

export type ChecklistObjectViewProps = {
  checklist: ChecklistInstance;
  onTitleChange: (checklistId: string, title: string) => void;
  onItemTextChange: (checklistId: string, itemId: string, text: string) => void;
  onToggleItem: (checklistId: string, itemId: string) => void;
  onDeleteItem: (checklistId: string, itemId: string) => void;
  onAddItem: (checklistId: string) => void;
  onColorChange: (checklistId: string, color: LabObjectColor) => void;
  onResize: (checklistId: string, size: LabObjectSize) => void;
  onDelete: (checklistId: string) => void;
};

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
      data-4663-checklist-control={testId}
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

function ChecklistTitleInput({
  checklistId,
  title,
  foreground,
  onTitleChange,
}: {
  checklistId: string;
  title: string;
  foreground: string;
  onTitleChange: (checklistId: string, title: string) => void;
}) {
  const ref = useInteractiveControlProtection<HTMLInputElement>();
  return (
    <input
      ref={ref}
      value={title}
      maxLength={CHECKLIST_TITLE_MAX_LENGTH}
      spellCheck={false}
      aria-label="Checklist title"
      placeholder="TITLE"
      data-4663-checklist-title
      data-4663-checklist-editor=""
      className="relative z-[1] min-h-8 w-full bg-transparent font-mono text-[11px] tracking-wide outline-none placeholder:opacity-50"
      style={{ color: foreground }}
      onPointerDown={stopPlayhtmlMoveStart}
      onMouseDown={stopPlayhtmlMoveStart}
      onTouchStart={stopPlayhtmlMoveStart}
      onChange={(event) => onTitleChange(checklistId, event.target.value)}
    />
  );
}

function ChecklistItemRow({
  checklistId,
  item,
  visual,
  onItemTextChange,
  onToggleItem,
  onDeleteItem,
}: {
  checklistId: string;
  item: ChecklistItem;
  visual: LabObjectColorVisual;
  onItemTextChange: (checklistId: string, itemId: string, text: string) => void;
  onToggleItem: (checklistId: string, itemId: string) => void;
  onDeleteItem: (checklistId: string, itemId: string) => void;
}) {
  const toggleRef = useInteractiveControlProtection<HTMLButtonElement>();
  const inputRef = useInteractiveControlProtection<HTMLInputElement>();
  return (
    <div
      className="relative z-[1] flex min-h-8 items-center gap-1"
      data-4663-checklist-item={item.id}
    >
      <button
        ref={toggleRef}
        type="button"
        aria-label={item.completed ? "Mark incomplete" : "Mark complete"}
        aria-pressed={item.completed}
        data-4663-checklist-toggle
        className="shrink-0 touch-manipulation font-mono text-[11px] tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
        style={{ color: visual.muted }}
        onPointerDown={stopPlayhtmlMoveStart}
        onMouseDown={stopPlayhtmlMoveStart}
        onTouchStart={stopPlayhtmlMoveStart}
        onClick={(event) => {
          event.stopPropagation();
          onToggleItem(checklistId, item.id);
        }}
      >
        {item.completed ? "[x]" : "[ ]"}
      </button>
      <input
        ref={inputRef}
        value={item.text}
        maxLength={CHECKLIST_ITEM_MAX_LENGTH}
        spellCheck={false}
        aria-label="Checklist item"
        placeholder="ITEM"
        data-4663-checklist-item-text
        data-4663-checklist-editor=""
        className={`min-w-0 flex-1 bg-transparent font-mono text-[11px] tracking-wide outline-none placeholder:opacity-50 ${
          item.completed ? "line-through" : ""
        }`}
        style={{
          color: item.completed ? visual.muted : visual.foreground,
        }}
        onPointerDown={stopPlayhtmlMoveStart}
        onMouseDown={stopPlayhtmlMoveStart}
        onTouchStart={stopPlayhtmlMoveStart}
        onChange={(event) =>
          onItemTextChange(checklistId, item.id, event.target.value)
        }
      />
      <CompactButton
        label="Delete item"
        testId="delete-item"
        muted={visual.muted}
        onClick={() => onDeleteItem(checklistId, item.id)}
      >
        [ × ]
      </CompactButton>
    </div>
  );
}

export function ChecklistObjectView({
  checklist,
  onTitleChange,
  onItemTextChange,
  onToggleItem,
  onDeleteItem,
  onAddItem,
  onColorChange,
  onResize,
  onDelete,
}: ChecklistObjectViewProps) {
  const move = usePlayhtmlMoveForeground<HTMLDivElement>();
  const canAdd = canAddChecklistItem(checklist);
  const visual = labObjectColorVisual(checklist.color);

  return (
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
      <div
        id={playhtmlChecklistElementId(checklist.id)}
        className="pointer-events-auto absolute z-[16] cursor-grab touch-manipulation select-none active:cursor-grabbing"
        style={{
          left: `${checklist.leftPct}%`,
          top: `${checklist.topPct}%`,
          width: `${checklist.widthPct}%`,
          height: `${checklist.heightPct}%`,
        }}
        data-4663-checklist={checklist.id}
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
          {/* z-[5] so overflowing colour swatches stack above title/items (z-[1]). */}
          <div className="relative z-[5] flex shrink-0 items-center justify-between gap-2">
            <span
              className="font-mono text-[10px] tracking-wide"
              style={{ color: visual.muted }}
              data-4663-checklist-label
            >
              CHECKLIST
            </span>
            <div className="flex items-center gap-0.5">
              <LabObjectColorPicker
                value={checklist.color}
                onChange={(color) => onColorChange(checklist.id, color)}
              />
              <CompactButton
                label="Delete checklist"
                testId="delete"
                muted={visual.muted}
                onClick={() => onDelete(checklist.id)}
              >
                [ × ]
              </CompactButton>
            </div>
          </div>
          <ChecklistTitleInput
            checklistId={checklist.id}
            title={checklist.title}
            foreground={visual.foreground}
            onTitleChange={onTitleChange}
          />
          <div
            className="relative z-[1] min-h-0 flex-1 overflow-y-auto"
            data-4663-checklist-items
          >
            {checklist.items.map((item) => (
              <ChecklistItemRow
                key={item.id}
                checklistId={checklist.id}
                item={item}
                visual={visual}
                onItemTextChange={onItemTextChange}
                onToggleItem={onToggleItem}
                onDeleteItem={onDeleteItem}
              />
            ))}
          </div>
          {canAdd ? (
            <div className="relative z-[1] shrink-0 pt-0.5">
              <CompactButton
                label="Add item"
                testId="add-item"
                muted={visual.muted}
                onClick={() => onAddItem(checklist.id)}
              >
                [ + ITEM ]
              </CompactButton>
            </div>
          ) : null}
          <LabResizeHandle
            hostSelector="[data-4663-checklist]"
            editorSelector="[data-4663-checklist-editor]"
            size={{
              widthPct: checklist.widthPct,
              heightPct: checklist.heightPct,
            }}
            limits={CHECKLIST_SIZE_LIMITS}
            onResize={(size) => onResize(checklist.id, size)}
            ariaLabel="Resize checklist"
            dataAttr="data-4663-checklist-resize"
          />
        </div>
      </div>
    </CanMoveElement>
  );
}
