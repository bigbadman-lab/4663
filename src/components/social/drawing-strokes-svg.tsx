"use client";

/**
 * Shared SVG stroke renderer for live drafts and finished drawings.
 *
 * Points are 0–1 in the host. When host world-px size is provided, the viewBox
 * matches that size so stroke width stays constant in world space after the
 * published box is tightened (preserveAspectRatio none would otherwise stretch
 * DRAWING_BRUSH_SIZE anisotropically).
 */

import { DRAWING_STROKE_WIDTH_WORLD_PX } from "@/lib/social/drawing-ink-bounds";
import {
  DRAWING_BRUSH_SIZE,
  strokeToSvgPoints,
  type DrawingStroke,
} from "@/lib/social/ephemeral-drawing";

export type DrawingStrokesSvgProps = {
  strokes: readonly DrawingStroke[];
  opacity?: number;
  className?: string;
  /** World-px width of the host. Omit only for legacy 0–100 user units. */
  widthWorldPx?: number;
  /** World-px height of the host. */
  heightWorldPx?: number;
  /** Multiplies world-px stroke width (DRAW object scale). Default 1. */
  strokeScale?: number;
};

export function DrawingStrokesSvg({
  strokes,
  opacity = 1,
  className,
  widthWorldPx,
  heightWorldPx,
  strokeScale = 1,
}: DrawingStrokesSvgProps) {
  const useWorldPx =
    typeof widthWorldPx === "number" &&
    widthWorldPx > 0 &&
    typeof heightWorldPx === "number" &&
    heightWorldPx > 0;
  const vbW = useWorldPx ? widthWorldPx : 100;
  const vbH = useWorldPx ? heightWorldPx : 100;
  const scale =
    Number.isFinite(strokeScale) && strokeScale > 0 ? strokeScale : 1;
  const strokeWidth = useWorldPx
    ? DRAWING_STROKE_WIDTH_WORLD_PX * scale
    : DRAWING_BRUSH_SIZE;
  const radius = strokeWidth / 2;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${vbW} ${vbH}`}
      preserveAspectRatio="none"
      width="100%"
      height="100%"
      aria-hidden
      style={{ opacity }}
    >
      {strokes.map((stroke, index) => {
        if (stroke.points.length === 0) return null;
        if (stroke.points.length === 1) {
          const p = stroke.points[0]!;
          return (
            <circle
              key={`dot-${index}`}
              cx={p.x * vbW}
              cy={p.y * vbH}
              r={radius}
              fill={stroke.colour}
            />
          );
        }
        const points = useWorldPx
          ? stroke.points
              .map((p) => `${(p.x * vbW).toFixed(2)},${(p.y * vbH).toFixed(2)}`)
              .join(" ")
          : strokeToSvgPoints(stroke.points);
        return (
          <polyline
            key={`stroke-${index}`}
            points={points}
            fill="none"
            stroke={stroke.colour}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}
