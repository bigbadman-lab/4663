"use client";

/**
 * World-space SVG renderer for BRUSH strokes (completed + live drafts).
 * Points stored as world %; rendered in world px so stroke width stays uniform
 * across the non-square world.
 *
 * Mounted inside `#4663-world` (camera translate/scale). Stroke width uses SVG
 * user units in world px and scales with the world transform on zoom — thickness
 * is not locked to screen pixels.
 */

import {
  BRUSH_STROKE_WIDTH_WORLD_PX,
  type BrushStroke,
} from "@/lib/social/ephemeral-brush";
import { WORLD_HEIGHT_PX, WORLD_WIDTH_PX } from "@/lib/canvas/world-camera";

export type BrushStrokesSvgProps = {
  strokes: readonly BrushStroke[];
  opacity?: number;
  className?: string;
};

export function BrushStrokesSvg({
  strokes,
  opacity = 1,
  className,
}: BrushStrokesSvgProps) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${WORLD_WIDTH_PX} ${WORLD_HEIGHT_PX}`}
      width="100%"
      height="100%"
      aria-hidden
      style={{ opacity }}
      preserveAspectRatio="none"
    >
      {strokes.map((stroke, index) => {
        if (stroke.points.length === 0) return null;
        const pts = stroke.points.map((p) => ({
          x: (p.x / 100) * WORLD_WIDTH_PX,
          y: (p.y / 100) * WORLD_HEIGHT_PX,
        }));
        if (pts.length === 1) {
          const p = pts[0]!;
          return (
            <circle
              key={`dot-${index}`}
              cx={p.x}
              cy={p.y}
              r={BRUSH_STROKE_WIDTH_WORLD_PX / 2}
              fill={stroke.colour}
            />
          );
        }
        return (
          <polyline
            key={`stroke-${index}`}
            points={pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}
            fill="none"
            stroke={stroke.colour}
            strokeWidth={BRUSH_STROKE_WIDTH_WORLD_PX}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}
