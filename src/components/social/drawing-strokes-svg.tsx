"use client";

/**
 * Shared SVG stroke renderer for live drafts and finished drawings.
 */

import {
  DRAWING_BRUSH_SIZE,
  strokeToSvgPoints,
  type DrawingStroke,
} from "@/lib/social/ephemeral-drawing";

export type DrawingStrokesSvgProps = {
  strokes: readonly DrawingStroke[];
  opacity?: number;
  className?: string;
};

export function DrawingStrokesSvg({
  strokes,
  opacity = 1,
  className,
}: DrawingStrokesSvgProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
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
              cx={p.x * 100}
              cy={p.y * 100}
              r={DRAWING_BRUSH_SIZE / 2}
              fill={stroke.colour}
            />
          );
        }
        return (
          <polyline
            key={`stroke-${index}`}
            points={strokeToSvgPoints(stroke.points)}
            fill="none"
            stroke={stroke.colour}
            strokeWidth={DRAWING_BRUSH_SIZE}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}
