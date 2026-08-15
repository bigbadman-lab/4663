"use client";

/**
 * Local DRAW session editor — compact zone, one brush, shared colour palette.
 * Broadcasts live strokes; publishes finished drawing on DONE.
 */

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { DrawingStrokesSvg } from "@/components/social/drawing-strokes-svg";
import {
  DEFAULT_DRAWING_COLOUR,
  DRAW_COLOURS,
  DRAWING_BRUSH_SIZE,
  DRAWING_MAX_POINTS_PER_STROKE,
  DRAWING_MAX_STROKES,
  DRAWING_TOTAL_POINTS_LIMIT_COPY,
  drawingCanAcceptAnotherPoint,
  shouldAppendDrawingPoint,
  type DrawingColour,
  type DrawingPoint,
  type DrawingStroke,
} from "@/lib/social/ephemeral-drawing";
import { drawingDraftCanPublish } from "@/lib/social/drawing-draft";

export type DrawingSessionEditorProps = {
  draftDrawingId: string;
  leftPct: number;
  topPct: number;
  widthPct: number;
  aspectRatio: number;
  onStrokesChange: (strokes: DrawingStroke[]) => void;
  onDone: (strokes: DrawingStroke[]) => void;
  onCancel: () => void;
};

export function DrawingSessionEditor({
  draftDrawingId,
  leftPct,
  topPct,
  widthPct,
  aspectRatio,
  onStrokesChange,
  onDone,
  onCancel,
}: DrawingSessionEditorProps) {
  const [colour, setColour] = useState<DrawingColour>(DEFAULT_DRAWING_COLOUR);
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const strokesRef = useRef(strokes);

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef(false);
  const activePointsRef = useRef<DrawingPoint[]>([]);

  const emitStrokes = (next: DrawingStroke[]) => {
    setStrokes(next);
    strokesRef.current = next;
    onStrokesChange(next);
  };

  const pointerToNormalized = (
    clientX: number,
    clientY: number,
  ): DrawingPoint | null => {
    const el = surfaceRef.current;
    if (!el) return null;
    const bounds = el.getBoundingClientRect();
    const width = bounds.width || 1;
    const height = bounds.height || 1;
    return {
      x: Math.min(1, Math.max(0, (clientX - bounds.left) / width)),
      y: Math.min(1, Math.max(0, (clientY - bounds.top) / height)),
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointerToNormalized(event.clientX, event.clientY);
    if (!point) return;
    if (strokesRef.current.length >= DRAWING_MAX_STROKES) return;
    if (!drawingCanAcceptAnotherPoint(strokesRef.current)) return;

    drawingRef.current = true;
    activePointsRef.current = [point];
    event.currentTarget.setPointerCapture(event.pointerId);

    // Live preview: committed strokes + in-progress stroke.
    emitStrokes([
      ...strokesRef.current,
      { colour, points: [point] },
    ]);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointerToNormalized(event.clientX, event.clientY);
    if (!point) return;

    const last =
      activePointsRef.current[activePointsRef.current.length - 1] ?? null;
    if (!shouldAppendDrawingPoint(last, point)) return;
    if (activePointsRef.current.length >= DRAWING_MAX_POINTS_PER_STROKE) {
      return;
    }
    if (!drawingCanAcceptAnotherPoint(strokesRef.current)) return;

    activePointsRef.current = [...activePointsRef.current, point];
    const base = strokesRef.current.slice(0, -1);
    emitStrokes([
      ...base,
      { colour, points: [...activePointsRef.current] },
    ]);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }

    // Finalize in-progress stroke already mirrored in strokesRef.
    drawingRef.current = false;
    activePointsRef.current = [];
    onStrokesChange(strokesRef.current);
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    activePointsRef.current = [];
    // Drop incomplete last stroke on cancel.
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
      activePointsRef.current = [];
    }
    const next = strokesRef.current.slice(0, -1);
    emitStrokes(next);
  };

  const clear = () => {
    drawingRef.current = false;
    activePointsRef.current = [];
    emitStrokes([]);
  };

  const done = () => {
    drawingRef.current = false;
    activePointsRef.current = [];
    const finalStrokes = strokesRef.current;
    if (!drawingDraftCanPublish(finalStrokes)) return;
    onDone(finalStrokes);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  const canDone = drawingDraftCanPublish(strokes);
  const atPointCap = !drawingCanAcceptAnotherPoint(strokes);

  return (
    <div
      className="pointer-events-auto absolute z-[20]"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        width: `${widthPct}%`,
        aspectRatio: String(aspectRatio),
      }}
      data-4663-drawing-session
      data-4663-drawing-draft-id={draftDrawingId}
      data-4663-drawing-brush-size={DRAWING_BRUSH_SIZE}
      data-4663-drawing-aspect-ratio={aspectRatio}
      data-4663-snapshot-exclude=""
    >
      <div className="relative h-full w-full">
        <div
          ref={surfaceRef}
          className="absolute inset-0 cursor-crosshair touch-none"
          style={{
            cursor: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='3.5' fill='none' stroke='%23171717' stroke-width='1.5'/%3E%3C/svg%3E") 8 8, crosshair`,
          }}
          data-4663-drawing-surface
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="pointer-events-none absolute inset-0 border border-neutral-300/70 bg-white/10">
            <DrawingStrokesSvg strokes={strokes} />
          </div>
        </div>

        <div
          className="absolute top-full left-1/2 z-[21] mt-1 flex -translate-x-1/2 flex-col items-center gap-1.5 font-mono text-[10px] tracking-wide"
          data-4663-drawing-tools
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div
            className="flex max-w-[min(calc(100vw-1.5rem),12.5rem)] flex-wrap items-center justify-center gap-x-1 gap-y-1.5 overflow-x-hidden"
            data-4663-drawing-colours
          >
            {DRAW_COLOURS.map((swatch) => (
              <button
                key={swatch.value}
                type="button"
                aria-label={`Colour ${swatch.label}`}
                data-4663-drawing-colour={swatch.value}
                data-4663-drawing-colour-active={
                  colour === swatch.value ? "true" : "false"
                }
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
          {atPointCap ? (
            <p
              className="text-neutral-400"
              data-4663-drawing-point-limit
              role="status"
            >
              [ {DRAWING_TOTAL_POINTS_LIMIT_COPY} ]
            </p>
          ) : null}
          <div className="flex items-center gap-2 text-neutral-500">
            <button
              type="button"
              className="hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
              data-4663-drawing-undo
              onClick={undo}
            >
              [ UNDO ]
            </button>
            <button
              type="button"
              className="hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
              data-4663-drawing-clear
              onClick={clear}
            >
              [ CLEAR ]
            </button>
            <button
              type="button"
              className="hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:opacity-40"
              data-4663-drawing-done
              disabled={!canDone}
              onClick={done}
            >
              [ DONE ]
            </button>
            <button
              type="button"
              className="text-neutral-400 hover:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
              data-4663-drawing-cancel
              onClick={onCancel}
            >
              [ CANCEL ]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
