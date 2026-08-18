"use client";

/**
 * Social 8A.2 — top-right [ CANVAS ] tone menu (local presentation only).
 * Desktop chrome also shows inline paper swatches as shortcuts.
 */

import { useEffect, useId, useRef, useState } from "react";
import { PaperColorSwatch } from "@/components/paper-color-swatch";
import {
  CANVAS_TONE_COLORS,
  CANVAS_TONE_LABELS,
  CANVAS_TONES,
  canvasToneTitle,
  type CanvasTone,
} from "@/lib/canvas/canvas-tone";
import { useCanvasTone } from "@/lib/canvas/use-canvas-tone";

export function CanvasToneControl() {
  const { tone, setTone } = useCanvasTone();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && !root.contains(event.target)) {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="pointer-events-none relative flex flex-col items-end"
      data-4663-canvas-tone-control
    >
      <div className="pointer-events-none flex items-center justify-end gap-1.5">
        <div
          role="radiogroup"
          aria-label="Canvas colour"
          className="pointer-events-none hidden items-center gap-1 desktop-chrome:flex"
          data-4663-canvas-tone-swatches
        >
          {CANVAS_TONES.map((option) => {
            const visual = CANVAS_TONE_COLORS[option];
            const selected = option === tone;
            return (
              <PaperColorSwatch
                key={option}
                role="radio"
                aria-checked={selected}
                ariaLabel={`Set canvas colour to ${canvasToneTitle(option)}`}
                data-4663-canvas-tone-swatch={option}
                data-4663-canvas-tone-swatch-selected={
                  selected ? "true" : "false"
                }
                background={visual.bg}
                border={visual.border}
                selectedBorder={visual.fg}
                selected={selected}
                onClick={() => setTone(option)}
              />
            );
          })}
        </div>
        <button
          type="button"
          className="pointer-events-auto font-mono text-[10px] tracking-wide text-[color:var(--canvas-muted,#a3a3a3)] transition-colors hover:text-[color:var(--canvas-fg,#171717)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 desktop-chrome:text-[11px]"
          aria-label="Canvas tone"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={open ? menuId : undefined}
          data-4663-canvas-tone-trigger
          onClick={() => setOpen((value) => !value)}
        >
          [ CANVAS ]
        </button>
      </div>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Canvas tone"
          className="pointer-events-auto absolute top-full right-0 z-[21] mt-1 min-w-[7.5rem] border border-neutral-300/90 bg-white/95 px-2 py-1.5 shadow-sm backdrop-blur-[2px]"
          data-4663-canvas-tone-menu
        >
          <ul className="flex flex-col items-stretch gap-0.5">
            {CANVAS_TONES.map((option) => (
              <li key={option}>
                <ToneOptionButton
                  option={option}
                  selected={option === tone}
                  onSelect={(next) => {
                    setTone(next);
                    setOpen(false);
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ToneOptionButton({
  option,
  selected,
  onSelect,
}: {
  option: CanvasTone;
  selected: boolean;
  onSelect: (tone: CanvasTone) => void;
}) {
  const label = CANVAS_TONE_LABELS[option];
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      data-4663-canvas-tone-option={option}
      data-4663-canvas-tone-selected={selected ? "true" : "false"}
      className="pointer-events-auto w-full text-left font-mono text-[10px] tracking-wide text-neutral-500 transition-colors hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-400 desktop-chrome:text-[11px]"
      onClick={() => onSelect(option)}
    >
      {selected ? `[ ${label} ]` : label}
    </button>
  );
}
