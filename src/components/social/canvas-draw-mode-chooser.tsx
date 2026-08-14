"use client";

/**
 * Minimal DRAW mode chooser — OBJECT (bounded) vs BRUSH (world).
 */

type CanvasDrawModeChooserProps = {
  leftPct: number;
  topPct: number;
  onChooseObject: () => void;
  onChooseBrush: () => void;
  onCancel: () => void;
};

export function CanvasDrawModeChooser({
  leftPct,
  topPct,
  onChooseObject,
  onChooseBrush,
  onCancel,
}: CanvasDrawModeChooserProps) {
  return (
    <div
      className="absolute z-[19] -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
      data-4663-draw-mode-chooser
    >
      <div className="flex flex-col items-center gap-1 font-mono text-[11px] tracking-wide">
        <span className="text-[10px] text-neutral-400" data-4663-draw-mode-label>
          DRAW
        </span>
        <button
          type="button"
          className="text-neutral-500 transition-colors hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
          data-4663-draw-mode-object
          onClick={(event) => {
            event.stopPropagation();
            onChooseObject();
          }}
        >
          [ OBJECT ]
        </button>
        <button
          type="button"
          className="text-neutral-500 transition-colors hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
          data-4663-draw-mode-brush
          onClick={(event) => {
            event.stopPropagation();
            onChooseBrush();
          }}
        >
          [ BRUSH ]
        </button>
        <button
          type="button"
          className="text-[10px] text-neutral-400 transition-colors hover:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
          data-4663-draw-mode-cancel
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
