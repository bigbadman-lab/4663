"use client";

/**
 * World-space SVG renderer for BRUSH strokes (completed + live drafts).
 * Points stored as world %; rendered in world px so stroke width stays uniform
 * across the non-square world.
 *
 * Optional `bounds` crops the viewBox to the ink AABB so a finished document
 * is not a full-world empty rectangle.
 */

import {
  BRUSH_STROKE_WIDTH_WORLD_PX,
  type BrushStroke,
} from "@/lib/social/ephemeral-brush";
import type { InkBoundsPct } from "@/lib/social/drawing-ink-bounds";
import { WORLD_HEIGHT_PX, WORLD_WIDTH_PX } from "@/lib/canvas/world-camera";

export type BrushStrokesSvgProps = {
  strokes: readonly BrushStroke[];
  opacity?: number;
  className?: string;
  /** Tight world-% box; omitted for live full-world overlay. */
  bounds?: InkBoundsPct;
};

export function BrushStrokesSvg({
  strokes,
  opacity = 1,
  className,
  bounds,
}: BrushStrokesSvgProps) {
  const leftPx = bounds ? (bounds.leftPct / 100) * WORLD_WIDTH_PX : 0;
  const topPx = bounds ? (bounds.topPct / 100) * WORLD_HEIGHT_PX : 0;
  const widthPx = bounds
    ? (bounds.widthPct / 100) * WORLD_WIDTH_PX
    : WORLD_WIDTH_PX;
  const heightPx = bounds
    ? (bounds.heightPct / 100) * WORLD_HEIGHT_PX
    : WORLD_HEIGHT_PX;

  return (
    <svg
      className={className}
      viewBox={`${leftPx} ${topPx} ${widthPx} ${heightPx}`}
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
