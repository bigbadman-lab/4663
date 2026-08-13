"use client";

/**
 * Social 8A — responsive bottom control dock (TEXT / DRAW / MARK / SUMMON / RESET).
 * Fixed viewport-bottom tray; not PlayHTML-movable. Pointer-events only on the dock shell.
 */

import {
  CONTROL_DOCK_ITEMS,
  type ControlDockActionId,
  type ControlDockItem,
} from "@/lib/canvas/control-palette";
import { PLAYHTML_CONTROL_PALETTE_ID } from "@/lib/canvas/hero";
import { getCanvasCreateActions } from "@/lib/social/canvas-create-actions";

export type CanvasControlPaletteProps = {
  onSummon?: () => void;
  onDismissSummon?: () => void;
  onReset?: () => void;
  onText?: () => void;
  onDraw?: () => void;
  onMark?: () => void;
  canText?: boolean;
  canDraw?: boolean;
  canMark?: boolean;
  canSummon?: boolean;
  summonActive?: boolean;
  isSummonOwner?: boolean;
  canReset?: boolean;
};

function DockIcon({ item }: { item: ControlDockItem }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static public icons
    <img
      src={item.iconSrc}
      alt=""
      width={32}
      height={32}
      draggable={false}
      className="pointer-events-none h-7 w-7 object-contain select-none sm:h-8 sm:w-8"
      data-4663-dock-icon={item.id}
      data-4663-palette-icon-slot={item.id}
    />
  );
}

function isDisabled(
  id: ControlDockActionId,
  props: CanvasControlPaletteProps,
): boolean {
  switch (id) {
    case "text":
      return !(props.canText ?? false);
    case "draw":
      return !(props.canDraw ?? false);
    case "mark":
      return !(props.canMark ?? false);
    case "summon":
      return !(props.canSummon ?? false) || !!props.summonActive;
    case "reset":
      return !(props.canReset ?? false);
    default:
      return true;
  }
}

export function CanvasControlPalette({
  onSummon,
  onDismissSummon,
  onReset,
  onText,
  onDraw,
  onMark,
  canText = false,
  canDraw = false,
  canMark = false,
  canSummon = false,
  summonActive = false,
  isSummonOwner = false,
  canReset = false,
}: CanvasControlPaletteProps) {
  const props: CanvasControlPaletteProps = {
    canText,
    canDraw,
    canMark,
    canSummon,
    summonActive,
    canReset,
  };

  const runCreate = (kind: "text" | "draw" | "mark") => {
    const bridge = getCanvasCreateActions();
    if (kind === "text") {
      onText?.();
      bridge?.openText();
      return;
    }
    if (kind === "draw") {
      onDraw?.();
      bridge?.openDraw();
      return;
    }
    onMark?.();
    bridge?.openMark();
  };

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[18] flex justify-center"
      style={{
        /* Sit above bottom-left presence + bottom-right clock (chrome ~bottom-5/6). */
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 3.75rem)",
      }}
      data-4663-control-dock
      data-4663-control-palette
    >
      <div
        id={PLAYHTML_CONTROL_PALETTE_ID}
        className="pointer-events-auto mx-2 flex max-w-[min(100%,26rem)] flex-col items-center gap-1.5 sm:max-w-[min(100%,28rem)]"
        data-4663-control-palette-shell
      >
        <div
          className="flex w-full items-stretch justify-between gap-1 rounded-2xl border border-neutral-300/90 bg-white/90 px-1.5 py-1.5 shadow-sm backdrop-blur-[2px] sm:gap-1.5 sm:px-2 sm:py-2"
          data-4663-control-dock-tray
        >
          {CONTROL_DOCK_ITEMS.map((item) => {
            const disabled = isDisabled(item.id, props);
            return (
              <button
                key={item.id}
                type="button"
                title={item.label}
                aria-label={item.label}
                aria-disabled={disabled ? true : undefined}
                data-4663-palette-control={item.id}
                data-4663-dock-control={item.id}
                data-4663-palette-disabled={disabled ? "true" : "false"}
                data-4663-palette-summon-active={
                  item.id === "summon" && summonActive ? "true" : undefined
                }
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  if (item.id === "text") {
                    runCreate("text");
                    return;
                  }
                  if (item.id === "draw") {
                    runCreate("draw");
                    return;
                  }
                  if (item.id === "mark") {
                    runCreate("mark");
                    return;
                  }
                  if (item.id === "summon") {
                    onSummon?.();
                    return;
                  }
                  if (item.id === "reset") {
                    onReset?.();
                  }
                }}
                className="flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 font-mono text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-400 active:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-35 sm:min-h-14 sm:gap-1 sm:px-1.5"
              >
                <DockIcon item={item} />
                <span
                  className="max-w-full truncate text-[9px] leading-none tracking-wide sm:text-[10px]"
                  data-4663-dock-label={item.id}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
        {summonActive && isSummonOwner ? (
          <button
            type="button"
            className="pointer-events-auto font-mono text-[10px] tracking-wide text-neutral-500 transition-colors hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
            data-4663-summon-dismiss
            onClick={(event) => {
              event.stopPropagation();
              onDismissSummon?.();
            }}
          >
            [ DISMISS ]
          </button>
        ) : null}
      </div>
    </div>
  );
}
