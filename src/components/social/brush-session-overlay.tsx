"use client";

/**
 * Armed BRUSH session — full-world draw surface + fixed-in-viewport tools.
 * Points sampled from the painted overlay rect (same space the SVG occupies).
 */

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { BrushStrokesSvg } from "@/components/social/brush-strokes-svg";
import { isUsableCanvasPointer } from "@/lib/canvas/canvas-pan-gesture";
import { isInteractiveCanvasControlTarget } from "@/lib/canvas/interactive-control";
import { brushDraftCanPublish } from "@/lib/social/brush-draft";
import {
  BRUSH_COLOURS,
  BRUSH_MAX_POINTS_PER_STROKE,
  BRUSH_MAX_STROKES,
  DEFAULT_BRUSH_COLOUR,
  clientPointToBrushWorldPctFromPaintedRect,
  resolveBrushDoneIntent,
  shouldAppendBrushPoint,
  type BrushColour,
  type BrushPoint,
  type BrushStroke,
} from "@/lib/social/ephemeral-brush";

export type BrushSessionOverlayProps = {
  draftBrushId: string;
  toolsLeftPct: number;
  toolsTopPct: number;
  onStrokesChange: (strokes: BrushStroke[]) => void;
  onDone: (strokes: BrushStroke[]) => void;
  onCancel: () => void;
  /** Toggle BRUSH again → exit (finalize if possible). */
  onToggleExit: (strokes: BrushStroke[]) => void;
};

export function BrushSessionOverlay({
  draftBrushId,
  toolsLeftPct,
  toolsTopPct,
  onStrokesChange,
  onDone,
  onCancel,
  onToggleExit,
}: BrushSessionOverlayProps) {
  const [colour, setColour] = useState<BrushColour>(DEFAULT_BRUSH_COLOUR);
  const [strokes, setStrokes] = useState<BrushStroke[]>([]);
  const strokesRef = useRef<BrushStroke[]>([]);

  const drawingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const activePointsRef = useRef<BrushPoint[]>([]);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  const emitStrokes = (next: BrushStroke[]) => {
    setStrokes(next);
    strokesRef.current = next;
    onStrokesChange(next);
  };

  const pointerToWorld = (
    clientX: number,
    clientY: number,
  ): BrushPoint | null => {
    const el = surfaceRef.current;
    if (!el) return null;
    return clientPointToBrushWorldPctFromPaintedRect(
      clientX,
      clientY,
      el.getBoundingClientRect(),
    );
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isUsableCanvasPointer(event)) return;
    if (isInteractiveCanvasControlTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointerToWorld(event.clientX, event.clientY);
    if (!point) return;
    if (strokesRef.current.length >= BRUSH_MAX_STROKES) return;

    drawingRef.current = true;
    activePointerIdRef.current = event.pointerId;
    activePointsRef.current = [point];
    event.currentTarget.setPointerCapture(event.pointerId);

    emitStrokes([
      ...strokesRef.current,
      { colour, points: [point] },
    ]);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawingRef.current) return;
    if (activePointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointerToWorld(event.clientX, event.clientY);
    if (!point) return;

    const last =
      activePointsRef.current[activePointsRef.current.length - 1] ?? null;
    if (!shouldAppendBrushPoint(last, point)) return;
    if (activePointsRef.current.length >= BRUSH_MAX_POINTS_PER_STROKE) {
      return;
    }

    activePointsRef.current = [...activePointsRef.current, point];
    const base = strokesRef.current.slice(0, -1);
    emitStrokes([
      ...base,
      { colour, points: [...activePointsRef.current] },
    ]);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawingRef.current) return;
    if (activePointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    drawingRef.current = false;
    activePointerIdRef.current = null;
    activePointsRef.current = [];
    onStrokesChange(strokesRef.current);
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawingRef.current) return;
    if (activePointerIdRef.current !== event.pointerId) return;
    drawingRef.current = false;
    activePointerIdRef.current = null;
    activePointsRef.current = [];
    const next = strokesRef.current.slice(0, -1);
    emitStrokes(next);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const undo = () => {
    if (drawingRef.current) {
      drawingRef.current = false;
      activePointerIdRef.current = null;
      activePointsRef.current = [];
    }
    emitStrokes(strokesRef.current.slice(0, -1));
  };

  const clear = () => {
    drawingRef.current = false;
    activePointerIdRef.current = null;
    activePointsRef.current = [];
    emitStrokes([]);
  };

  const done = () => {
    drawingRef.current = false;
    activePointerIdRef.current = null;
    activePointsRef.current = [];
    const finalStrokes = strokesRef.current;
    if (resolveBrushDoneIntent(finalStrokes) !== "publish") return;
    onDone(finalStrokes);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      drawingRef.current = false;
      activePointerIdRef.current = null;
      activePointsRef.current = [];
      const finalStrokes = strokesRef.current;
      if (brushDraftCanPublish(finalStrokes)) {
        onDone(finalStrokes);
      } else {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDone, onCancel]);

  const canDone = brushDraftCanPublish(strokes);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[20]"
      data-4663-brush-session
      data-4663-brush-draft-id={draftBrushId}
      data-4663-snapshot-exclude=""
    >
      <div
        ref={surfaceRef}
        className="pointer-events-auto absolute inset-0 touch-none"
        style={{
          cursor: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='3.5' fill='none' stroke='%23171717' stroke-width='1.5'/%3E%3C/svg%3E") 8 8, crosshair`,
        }}
        data-4663-brush-surface
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-0">
          <BrushStrokesSvg strokes={strokes} />
        </div>
      </div>

      <div
        className="pointer-events-auto absolute z-[21] -translate-x-1/2 font-mono text-[10px] tracking-wide"
        style={{
          left: `${toolsLeftPct}%`,
          top: `${toolsTopPct}%`,
        }}
        data-4663-brush-tools
        data-4663-interactive-control="true"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-neutral-400" data-4663-brush-label>
            BRUSH
          </span>
          <div
            className="flex max-w-[min(calc(100vw-1.5rem),12.5rem)] flex-wrap items-center justify-center gap-x-1 gap-y-1.5 overflow-x-hidden"
            data-4663-brush-colours
          >
            {BRUSH_COLOURS.map((swatch) => (
              <button
                key={swatch.value}
                type="button"
                aria-label={`Colour ${swatch.label}`}
                data-4663-brush-colour={swatch.value}
                data-4663-brush-colour-active={
                  colour === swatch.value ? "true" : "false"
                }
                data-4663-interactive-control="true"
                className="h-3.5 w-3.5 shrink-0 border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-400"
                style={{
                  backgroundColor: swatch.value,
                  outline:
                    colour === swatch.value
                      ? "2px solid #404040"
                      : "1px solid #d4d4d4",
                  outlineOffset: colour === swatch.value ? "1px" : "0",
                }}
                onClick={() => setColour(swatch.value)}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 text-neutral-500">
            <button
              type="button"
              className="hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
              data-4663-brush-undo
              data-4663-interactive-control="true"
              onClick={undo}
            >
              [ UNDO ]
            </button>
            <button
              type="button"
              className="hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
              data-4663-brush-clear
              data-4663-interactive-control="true"
              onClick={clear}
            >
              [ CLEAR ]
            </button>
            <button
              type="button"
              className="hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:opacity-40"
              data-4663-brush-done
              data-4663-interactive-control="true"
              disabled={!canDone}
              onClick={done}
            >
              [ DONE ]
            </button>
            <button
              type="button"
              className="text-neutral-400 hover:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
              data-4663-brush-toggle
              data-4663-interactive-control="true"
              onClick={() => {
                drawingRef.current = false;
                activePointerIdRef.current = null;
                activePointsRef.current = [];
                onToggleExit(strokesRef.current);
              }}
            >
              [ BRUSH ]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
