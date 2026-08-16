"use client";

/**
 * Social 8A — responsive bottom control dock (TEXT / DRAW / MARK / RADAR / RESET).
 * Fixed viewport-bottom tray; not PlayHTML-movable. Pointer-events only on the dock shell.
 * RADAR (dock id `summon`) opens the continuation watchlist (same panel as the monitoring object).
 */

import {
  getLiveControlDockItems,
  getSummonDockA11yLabel,
  HOME_VIEW_ARIA_LABEL,
  type ControlDockActionId,
  type ControlDockItem,
} from "@/lib/canvas/control-palette";
import {
  controlNoticeMessage,
  type ControlNoticeKind,
} from "@/lib/canvas/control-notice";
import { MARK_ENABLED } from "@/lib/social/canvas-mark";
import { PLAYHTML_CONTROL_PALETTE_ID } from "@/lib/canvas/hero";
import { useHeroPreferences } from "@/lib/canvas/use-hero-preferences";
import { openPonsMonitoringPanel } from "@/components/canvas/pons-monitoring-panel-state";
import { getCanvasCreateActions } from "@/lib/social/canvas-create-actions";
import { getSnapshotActions } from "@/lib/canvas/snapshot-actions";
import { SnapshotShortcutHint } from "@/components/canvas/snapshot-shortcut-hint";

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

function DockIcon({ item }: { item: ControlDockItem }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static public icons
    <img
      src={item.iconSrc}
      alt=""
      width={32}
      height={32}
      draggable={false}
      className="pointer-events-none h-7 w-7 object-contain select-none desktop-chrome:h-8 desktop-chrome:w-8"
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
      // RADAR opens the local watchlist — never gated on summon participation.
      return false;
    case "reset":
      return !(props.canReset ?? false);
    case "home":
      return false;
    default:
      return true;
  }
}

const DOCK_BUTTON_BASE =
  "flex min-h-12 min-w-[3.75rem] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-1.5 font-mono transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-35 desktop-chrome:min-h-14 desktop-chrome:min-w-[4.25rem] desktop-chrome:gap-1 desktop-chrome:px-1";

const DOCK_BUTTON_IDLE =
  "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 focus-visible:outline-neutral-400 active:bg-neutral-100";

export function CanvasControlPalette({
  onSummon: _onSummon,
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
  void _onSummon;
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
  const { preferences: heroPreferences, showHero } = useHeroPreferences();

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[18] flex justify-center pb-[calc(env(safe-area-inset-bottom,0px)+5.75rem)] desktop-chrome:pb-[calc(env(safe-area-inset-bottom,0px)+3.75rem)]"
      data-4663-control-dock
      data-4663-control-palette
      data-4663-snapshot-exclude=""
    >
      <div
        id={PLAYHTML_CONTROL_PALETTE_ID}
        className="pointer-events-auto mx-2 flex max-w-[min(100%,28rem)] flex-col items-center desktop-chrome:max-w-[min(100%,32rem)]"
        data-4663-control-palette-shell
      >
        {noticeText ? (
          <p
            role="status"
            aria-live="polite"
            className="pointer-events-none mb-1.5 max-w-full truncate px-2 text-center font-mono text-[10px] tracking-wide text-neutral-600 desktop-chrome:text-[11px]"
            data-4663-control-notice
            data-4663-control-notice-kind={controlNotice ?? undefined}
          >
            {noticeText}
          </p>
        ) : null}
        {!heroPreferences.visible ? (
          <button
            type="button"
            className="mb-1.5 inline-flex min-h-11 items-center px-3 font-mono text-[10px] tracking-wide text-[color:var(--canvas-muted,#a3a3a3)] touch-manipulation transition-colors hover:text-[color:var(--canvas-fg,#171717)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 desktop-chrome:text-[11px]"
            data-4663-show-hero
            aria-label="Show hero"
            onClick={() => showHero()}
          >
            [ SHOW HERO ]
          </button>
        ) : null}
        <div className="relative mb-1.5 flex justify-center">
          <button
            type="button"
            className="inline-flex min-h-11 items-center px-3 font-mono text-[10px] tracking-wide text-[color:var(--canvas-muted,#a3a3a3)] touch-manipulation transition-colors hover:text-[color:var(--canvas-fg,#171717)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 desktop-chrome:text-[11px]"
            data-4663-snapshot-trigger
            aria-label="Snapshot the visible canvas"
            onClick={() => {
              getSnapshotActions()?.startCapture();
            }}
          >
            [ SNAPSHOT ]
          </button>
          <SnapshotShortcutHint />
        </div>
        <div
          className="flex w-full items-stretch justify-between gap-1 rounded-2xl border border-neutral-300/90 bg-white/90 px-1.5 py-1.5 shadow-sm backdrop-blur-[2px] desktop-chrome:gap-1.5 desktop-chrome:px-2 desktop-chrome:py-2"
          data-4663-control-dock-tray
        >
          {getLiveControlDockItems().map((item) => {
            const disabled = isDisabled(item.id, props);
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
            return (
              <button
                key={item.id}
                type="button"
                title={a11yLabel}
                aria-label={a11yLabel}
                aria-disabled={disabled ? true : undefined}
                data-4663-palette-control={item.id}
                data-4663-dock-control={item.id}
                data-4663-palette-disabled={disabled ? "true" : "false"}
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
                    openPonsMonitoringPanel();
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
                className={`${DOCK_BUTTON_BASE} ${DOCK_BUTTON_IDLE}`}
              >
                <DockIcon item={item} />
                <span
                  className="whitespace-nowrap text-center text-[9px] leading-none tracking-wide desktop-chrome:text-[10px]"
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
