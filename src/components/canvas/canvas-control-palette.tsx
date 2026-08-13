"use client";

/**
 * Social 8A — responsive bottom control dock (TEXT / DRAW / MARK / SUMMON / RESET).
 * Fixed viewport-bottom tray; not PlayHTML-movable. Pointer-events only on the dock shell.
 * IC3.5 — transient local control notices + richer SUMMON a11y titles.
 */

import type { CSSProperties } from "react";
import {
  getLiveControlDockItems,
  getSummonDockA11yLabel,
  HOME_VIEW_ARIA_LABEL,
  isSummonDockDisabled,
  SUMMON_DOCK_ACTIVE_COLOR,
  type ControlDockActionId,
  type ControlDockItem,
} from "@/lib/canvas/control-palette";
import {
  controlNoticeMessage,
  type ControlNoticeKind,
} from "@/lib/canvas/control-notice";
import { MARK_ENABLED } from "@/lib/social/canvas-mark";
import { PLAYHTML_CONTROL_PALETTE_ID } from "@/lib/canvas/hero";
import { getCanvasCreateActions } from "@/lib/social/canvas-create-actions";

export type CanvasControlPaletteProps = {
  onSummon?: () => void;
  onReset?: () => void;
  onHome?: () => void;
  onText?: () => void;
  onDraw?: () => void;
  onMark?: () => void;
  canText?: boolean;
  canDraw?: boolean;
  canMark?: boolean;
  canSummon?: boolean;
  summonActive?: boolean;
  isSummonOwner?: boolean;
  summonInFlight?: boolean;
  summonCoolingDown?: boolean;
  canReset?: boolean;
  controlNotice?: ControlNoticeKind | null;
};

function DockIcon({
  item,
  tint,
}: {
  item: ControlDockItem;
  /** When set, recolour monochrome PNG via CSS mask (active Summon). */
  tint?: string;
}) {
  if (tint) {
    return (
      <span
        aria-hidden
        className="pointer-events-none inline-block h-7 w-7 shrink-0 sm:h-8 sm:w-8"
        style={{
          backgroundColor: tint,
          WebkitMaskImage: `url(${item.iconSrc})`,
          maskImage: `url(${item.iconSrc})`,
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        }}
        data-4663-dock-icon={item.id}
        data-4663-palette-icon-slot={item.id}
        data-4663-dock-icon-active="true"
      />
    );
  }

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
      if (!MARK_ENABLED) return true;
      return !(props.canMark ?? false);
    case "summon":
      return isSummonDockDisabled({
        canSummon: props.canSummon ?? false,
        summonActive: !!props.summonActive,
        isSummonOwner: !!props.isSummonOwner,
        summonInFlight: !!props.summonInFlight,
      });
    case "reset":
      return !(props.canReset ?? false);
    case "home":
      return false;
    default:
      return true;
  }
}

const DOCK_BUTTON_BASE =
  "flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 font-mono transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-35 sm:min-h-14 sm:gap-1 sm:px-1.5";

const DOCK_BUTTON_IDLE =
  "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 focus-visible:outline-neutral-400 active:bg-neutral-100";

const DOCK_BUTTON_SUMMON_ACTIVE =
  "cursor-pointer hover:bg-[color-mix(in_srgb,var(--4663-summon-active)_12%,transparent)] focus-visible:outline-[color-mix(in_srgb,var(--4663-summon-active)_55%,transparent)] active:bg-[color-mix(in_srgb,var(--4663-summon-active)_18%,transparent)]";

export function CanvasControlPalette({
  onSummon,
  onReset,
  onHome,
  onText,
  onDraw,
  onMark,
  canText = false,
  canDraw = false,
  canMark = false,
  canSummon = false,
  summonActive = false,
  isSummonOwner = false,
  summonInFlight = false,
  summonCoolingDown = false,
  canReset = false,
  controlNotice = null,
}: CanvasControlPaletteProps) {
  const props: CanvasControlPaletteProps = {
    canText,
    canDraw,
    canMark,
    canSummon,
    summonActive,
    isSummonOwner,
    summonInFlight,
    summonCoolingDown,
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
    if (!MARK_ENABLED) return;
    onMark?.();
    bridge?.openMark();
  };

  const noticeText = controlNotice
    ? controlNoticeMessage(controlNotice)
    : null;

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
        className="pointer-events-auto mx-2 flex max-w-[min(100%,26rem)] flex-col items-center sm:max-w-[min(100%,28rem)]"
        data-4663-control-palette-shell
      >
        {noticeText ? (
          <p
            role="status"
            aria-live="polite"
            className="pointer-events-none mb-1.5 max-w-full truncate px-2 text-center font-mono text-[10px] tracking-wide text-neutral-600 sm:text-[11px]"
            data-4663-control-notice
            data-4663-control-notice-kind={controlNotice ?? undefined}
          >
            {noticeText}
          </p>
        ) : null}
        <div
          className="flex w-full items-stretch justify-between gap-1 rounded-2xl border border-neutral-300/90 bg-white/90 px-1.5 py-1.5 shadow-sm backdrop-blur-[2px] sm:gap-1.5 sm:px-2 sm:py-2"
          data-4663-control-dock-tray
        >
          {getLiveControlDockItems().map((item) => {
            const disabled = isDisabled(item.id, props);
            const isSummonActive = item.id === "summon" && summonActive;
            const a11yLabel =
              item.id === "summon"
                ? getSummonDockA11yLabel({
                    summonActive,
                    isSummonOwner,
                    summonInFlight,
                    summonCoolingDown,
                  })
                : item.id === "home"
                  ? HOME_VIEW_ARIA_LABEL
                  : item.label;
            const activeStyle: CSSProperties | undefined = isSummonActive
              ? {
                  color: SUMMON_DOCK_ACTIVE_COLOR,
                  ["--4663-summon-active" as string]: SUMMON_DOCK_ACTIVE_COLOR,
                }
              : undefined;
            return (
              <button
                key={item.id}
                type="button"
                title={a11yLabel}
                aria-label={a11yLabel}
                aria-pressed={
                  item.id === "summon" ? summonActive : undefined
                }
                aria-disabled={disabled ? true : undefined}
                data-4663-palette-control={item.id}
                data-4663-dock-control={item.id}
                data-4663-palette-disabled={disabled ? "true" : "false"}
                data-4663-palette-summon-active={
                  isSummonActive ? "true" : undefined
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
                  if (item.id === "home") {
                    onHome?.();
                    return;
                  }
                  if (item.id === "reset") {
                    onReset?.();
                  }
                }}
                className={`${DOCK_BUTTON_BASE} ${
                  isSummonActive ? DOCK_BUTTON_SUMMON_ACTIVE : DOCK_BUTTON_IDLE
                }`}
                style={activeStyle}
              >
                <DockIcon
                  item={item}
                  tint={isSummonActive ? SUMMON_DOCK_ACTIVE_COLOR : undefined}
                />
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
      </div>
    </div>
  );
}
