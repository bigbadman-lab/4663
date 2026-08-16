"use client";

/**
 * Compact Lab object colour control. Does not know NOTE/CHECKLIST state.
 *
 * The open palette is `absolute` and overflows onto the object body.
 * Host chrome must stack above sibling editors (z-[1]) or those editors
 * intercept swatch hits. Do not portal — the canvas world is transformed.
 */

import { useState } from "react";
import { useInteractiveControlProtection } from "@/components/canvas/use-interactive-control-protection";
import { stopPlayhtmlMoveStart } from "@/lib/canvas/interactive-control";
import {
  LAB_OBJECT_COLOR_IDS,
  LAB_OBJECT_COLORS,
  labObjectColorVisual,
  type LabObjectColor,
} from "@/lib/modules/lab-object-color";

export type LabObjectColorPickerProps = {
  value: LabObjectColor;
  onChange: (color: LabObjectColor) => void;
};

function ColorSwatch({
  color,
  selected,
  onSelect,
}: {
  color: LabObjectColor;
  selected: boolean;
  onSelect: (color: LabObjectColor) => void;
}) {
  const ref = useInteractiveControlProtection<HTMLButtonElement>();
  const visual = LAB_OBJECT_COLORS[color];
  return (
    <button
      ref={ref}
      type="button"
      role="option"
      aria-label={color.toUpperCase()}
      aria-selected={selected}
      data-4663-lab-color-swatch={color}
      className="h-5 w-5 shrink-0 touch-manipulation rounded-full border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-400"
      style={{
        backgroundColor: visual.background,
        borderColor: selected ? visual.foreground : visual.border,
      }}
      onPointerDown={stopPlayhtmlMoveStart}
      onMouseDown={stopPlayhtmlMoveStart}
      onTouchStart={stopPlayhtmlMoveStart}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(color);
      }}
    />
  );
}

export function LabObjectColorPicker({
  value,
  onChange,
}: LabObjectColorPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useInteractiveControlProtection<HTMLButtonElement>();
  const paletteRef = useInteractiveControlProtection<HTMLDivElement>();
  const current = labObjectColorVisual(value);

  return (
    <div className="relative z-[5]" data-4663-lab-color-picker>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Choose colour"
        aria-expanded={open}
        aria-haspopup="listbox"
        data-4663-lab-color-trigger
        className="inline-flex h-8 w-8 items-center justify-center touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-400"
        onPointerDown={stopPlayhtmlMoveStart}
        onMouseDown={stopPlayhtmlMoveStart}
        onTouchStart={stopPlayhtmlMoveStart}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((next) => !next);
        }}
      >
        <span
          aria-hidden
          data-4663-lab-color-badge
          className="grid h-3.5 w-3.5 grid-cols-2 grid-rows-2 overflow-hidden rounded-[2px] border"
          style={{
            backgroundColor: current.background,
            borderColor: current.foreground,
          }}
        >
          <span style={{ backgroundColor: LAB_OBJECT_COLORS.yellow.background }} />
          <span style={{ backgroundColor: LAB_OBJECT_COLORS.blue.background }} />
          <span style={{ backgroundColor: LAB_OBJECT_COLORS.pink.background }} />
          <span style={{ backgroundColor: LAB_OBJECT_COLORS.dark.background }} />
        </span>
      </button>
      {open ? (
        <div
          ref={paletteRef}
          role="listbox"
          aria-label="Object colours"
          data-4663-lab-color-palette
          className="absolute right-0 top-full z-[6] mt-0.5 flex max-w-[calc(100vw-2rem)] flex-wrap gap-1 border border-neutral-300 bg-white p-1"
          onPointerDown={stopPlayhtmlMoveStart}
          onMouseDown={stopPlayhtmlMoveStart}
          onTouchStart={stopPlayhtmlMoveStart}
        >
          {LAB_OBJECT_COLOR_IDS.map((color) => (
            <ColorSwatch
              key={color}
              color={color}
              selected={color === value}
              onSelect={(next) => {
                onChange(next);
                setOpen(false);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
