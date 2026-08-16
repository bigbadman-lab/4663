"use client";

/**
 * Module Lab world host — same camera/world/pan stack as `/`, no homepage layers.
 */

import { ModuleLabChrome } from "@/components/modules/module-lab-chrome";
import { ModuleLabDock } from "@/components/modules/module-lab-dock";
import { useCanvasCamera } from "@/components/canvas/use-canvas-camera";
import { getModuleLabActions } from "@/lib/modules/lab-actions";
import {
  PLAYHTML_WORLD_BOUNDS_ID,
  WORLD_HEIGHT_PX,
  WORLD_WIDTH_PX,
} from "@/lib/canvas/world-camera";
import { NoteLayer } from "@/modules/create/note/note-layer";
import { ChecklistLayer } from "@/modules/organise/checklist/checklist-layer";

export function ModuleLabSurface() {
  const { worldRef, viewportRef, goHome, onViewportPointerDown } =
    useCanvasCamera();

  return (
    <>
      <ModuleLabChrome />
      <div
        ref={viewportRef}
        className="absolute inset-0 z-10 overflow-hidden overscroll-none"
        data-4663-canvas-viewport
        data-4663-canvas-surface
        data-4663-module-lab-surface
        onPointerDown={onViewportPointerDown}
      >
        <div
          ref={worldRef}
          id={PLAYHTML_WORLD_BOUNDS_ID}
          className="relative will-change-transform"
          data-4663-canvas-world
          style={{
            width: WORLD_WIDTH_PX,
            height: WORLD_HEIGHT_PX,
            transformOrigin: "0 0",
            transform: "translate(0px, 0px) scale(1)",
          }}
          data-4663-world-scale="1"
        >
          <div
            className="pointer-events-auto absolute inset-0 z-0 cursor-grab touch-none active:cursor-grabbing"
            data-4663-canvas-empty-hit
            data-4663-world-pan-hit
            aria-hidden
          />
          <NoteLayer />
          <ChecklistLayer />
        </div>
      </div>
      <ModuleLabDock
        onHome={goHome}
        onReset={() => {
          getModuleLabActions().reset();
          goHome();
        }}
      />
    </>
  );
}
