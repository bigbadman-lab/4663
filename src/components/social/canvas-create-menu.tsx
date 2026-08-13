"use client";

/**
 * Compact empty-canvas create menu — TEXT + DRAW + MARK.
 */

type CanvasCreateMenuProps = {
  leftPct: number;
  topPct: number;
  canMark?: boolean;
  onChooseText: () => void;
  onChooseDraw: () => void;
  onChooseMark?: () => void;
  onCancel: () => void;
};

export function CanvasCreateMenu({
  leftPct,
  topPct,
  canMark = false,
  onChooseText,
  onChooseDraw,
  onChooseMark,
  onCancel,
}: CanvasCreateMenuProps) {
  return (
    <div
      className="absolute z-[19] -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
      data-4663-canvas-create-menu
    >
      <div className="flex flex-col items-center gap-1 font-mono text-[11px] tracking-wide">
        <button
          type="button"
          className="text-neutral-500 transition-colors hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
          data-4663-canvas-create-text
          onClick={(event) => {
            event.stopPropagation();
            onChooseText();
          }}
        >
          [ TEXT ]
        </button>
        <button
          type="button"
          className="text-neutral-500 transition-colors hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
          data-4663-canvas-create-draw
          onClick={(event) => {
            event.stopPropagation();
            onChooseDraw();
          }}
        >
          [ DRAW ]
        </button>
        {canMark ? (
          <button
            type="button"
            className="text-neutral-500 transition-colors hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
            data-4663-canvas-create-mark
            onClick={(event) => {
              event.stopPropagation();
              onChooseMark?.();
            }}
          >
            [ MARK ]
          </button>
        ) : null}
        <button
          type="button"
          className="text-[10px] text-neutral-400 transition-colors hover:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
          data-4663-canvas-create-cancel
          onClick={(event) => {
            event.stopPropagation();
            onCancel();
          }}
        >
          [ CANCEL ]
        </button>
      </div>
    </div>
  );
}
