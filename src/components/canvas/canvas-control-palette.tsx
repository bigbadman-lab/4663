"use client";

/**
 * Shared movable control palette — placeholder icons only.
 * Actions are intentional no-ops until later stages.
 */

import { CanMoveElement } from "@playhtml/react";
import {
  CONTROL_PALETTE_ITEMS,
  type ControlPaletteActionId,
  type ControlPaletteItem,
} from "@/lib/canvas/control-palette";
import {
  CONTROL_PALETTE_DEFAULT_STYLE,
  PLAYHTML_CANVAS_BOUNDS_ID,
  PLAYHTML_CONTROL_PALETTE_ID,
} from "@/lib/canvas/hero";

function stopMoveStart(event: { stopPropagation(): void }): void {
  event.stopPropagation();
}

function onPlaceholderAction(id: ControlPaletteActionId): void {
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[4663-palette] placeholder action: ${id}`);
  }
}

/** Temporary glyph — replace the children of the icon slot with <img> later. */
function PlaceholderIcon({ item }: { item: ControlPaletteItem }) {
  const { placeholderColor: color, placeholderShape: shape, id } = item;

  if (shape === "triangle") {
    return (
      <span
        data-4663-palette-icon={id}
        className="pointer-events-none block h-0 w-0 border-x-[7px] border-b-[12px] border-x-transparent"
        style={{ borderBottomColor: color }}
        aria-hidden
      />
    );
  }

  if (shape === "plus") {
    return (
      <span
        data-4663-palette-icon={id}
        className="pointer-events-none relative block h-3.5 w-3.5"
        aria-hidden
      >
        <span
          className="absolute top-1/2 left-0 h-0.5 w-full -translate-y-1/2 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span
          className="absolute top-0 left-1/2 h-full w-0.5 -translate-x-1/2 rounded-full"
          style={{ backgroundColor: color }}
        />
      </span>
    );
  }

  if (shape === "diamond") {
    return (
      <span
        data-4663-palette-icon={id}
        className="pointer-events-none block h-3 w-3 rotate-45 rounded-[2px]"
        style={{ backgroundColor: color }}
        aria-hidden
      />
    );
  }

  if (shape === "square") {
    return (
      <span
        data-4663-palette-icon={id}
        className="pointer-events-none block h-3.5 w-3.5 rounded-[3px]"
        style={{ backgroundColor: color }}
        aria-hidden
      />
    );
  }

  return (
    <span
      data-4663-palette-icon={id}
      className="pointer-events-none block h-3.5 w-3.5 rounded-full"
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}

export function CanvasControlPalette() {
  return (
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
      <div
        id={PLAYHTML_CONTROL_PALETTE_ID}
        className="absolute z-[18] cursor-grab touch-manipulation select-none active:cursor-grabbing"
        style={CONTROL_PALETTE_DEFAULT_STYLE}
        data-4663-control-palette
      >
        <div className="-translate-x-1/2">
          <div
            className="flex max-w-[calc(100vw-2rem)] items-center gap-1 rounded-md border border-neutral-300 bg-white p-1 sm:gap-1.5 sm:p-1.5"
            data-4663-control-palette-shell
          >
            {CONTROL_PALETTE_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.label}
                aria-label={item.label}
                data-4663-palette-control={item.id}
                onClick={() => onPlaceholderAction(item.id)}
                onPointerDown={stopMoveStart}
                onMouseDown={stopMoveStart}
                onTouchStart={stopMoveStart}
                className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded border border-transparent hover:border-neutral-200 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-400 sm:h-11 sm:w-11"
              >
                <span
                  className="flex h-6 w-6 items-center justify-center"
                  data-4663-palette-icon-slot={item.id}
                >
                  <PlaceholderIcon item={item} />
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </CanMoveElement>
  );
}
