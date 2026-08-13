"use client";

/**
 * Main canvas surface: viewport clips a fixed world; PlayHTML bounds = world.
 * Control palette is fixed outside the camera-transformed world (IC1).
 */

import { CanvasControlPalette } from "@/components/canvas/canvas-control-palette";
import { MovableLiveEventLayer } from "@/components/canvas/movable-live-event-layer";
import { MovableHero } from "@/components/canvas/movable-hero";
import { MovableLogo } from "@/components/canvas/movable-logo";
import {
  PinnedPonsLayer,
  type PinnedLayerItem,
} from "@/components/canvas/pinned-pons-layer";
import { SummonLayer, type SummonLayerItem } from "@/components/canvas/summon-layer";
import { useCanvasCamera } from "@/components/canvas/use-canvas-camera";
import { EphemeralTextLayer } from "@/components/social/ephemeral-text-layer";
import { ParticipantPresenceLayer } from "@/components/social/participant-presence-layer";
import {
  CANVAS_HOME_REGION_ID,
  HOME_REGION_HEIGHT_PX,
  HOME_REGION_LEFT_PX,
  HOME_REGION_TOP_PX,
  HOME_REGION_WIDTH_PX,
  PLAYHTML_WORLD_BOUNDS_ID,
  WORLD_HEIGHT_PX,
  WORLD_WIDTH_PX,
} from "@/lib/canvas/world-camera";
import type { SlottedLiveEvent } from "@/lib/canvas/slots";

export type CanvasSurfaceProps = {
  liveItems?: readonly SlottedLiveEvent[];
  pinnedItems?: readonly PinnedLayerItem[];
  summonId?: string | null;
  summonItems?: readonly SummonLayerItem[];
  onSummon?: () => void;
  onReset?: () => void;
  onHome?: () => void;
  canText?: boolean;
  canDraw?: boolean;
  canMark?: boolean;
  canSummon?: boolean;
  summonActive?: boolean;
  isSummonOwner?: boolean;
  canReset?: boolean;
  isPinned?: (eventId: string) => boolean;
  onPin?: (
    eventId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onUnpin?: (
    pinId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
};

export function CanvasSurface({
  liveItems = [],
  pinnedItems = [],
  summonId = null,
  summonItems = [],
  onSummon,
  onReset,
  onHome: onHomeProp,
  canText = false,
  canDraw = false,
  canMark = false,
  canSummon = false,
  summonActive = false,
  isSummonOwner = false,
  canReset = false,
  isPinned,
  onPin,
  onUnpin,
}: CanvasSurfaceProps) {
  const { worldRef, viewportRef, goHome, onViewportPointerDown } =
    useCanvasCamera();

  const onHome = () => {
    goHome();
    onHomeProp?.();
  };

  return (
    <>
      <div
        ref={viewportRef}
        className="absolute inset-0 z-10 overflow-hidden"
        data-4663-canvas-viewport
        data-4663-canvas-surface
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
            transform: "translate(0px, 0px)",
          }}
        >
          {/* Full-world pan hit (desktop empty space outside the home artboard). */}
          <div
            className="pointer-events-auto absolute inset-0 z-0 cursor-grab active:cursor-grabbing"
            data-4663-world-pan-hit
            aria-hidden
          />

          <div
            id={CANVAS_HOME_REGION_ID}
            className="pointer-events-none absolute z-[1]"
            data-4663-home-region
            style={{
              left: HOME_REGION_LEFT_PX,
              top: HOME_REGION_TOP_PX,
              width: HOME_REGION_WIDTH_PX,
              height: HOME_REGION_HEIGHT_PX,
            }}
          >
            <div className="pointer-events-auto absolute inset-0">
              <EphemeralTextLayer />
              <MovableLogo />
              <MovableHero />
              <MovableLiveEventLayer
                items={liveItems}
                isPinned={isPinned}
                onPin={onPin}
              />
              <PinnedPonsLayer items={pinnedItems} onUnpin={onUnpin} />
              {summonId ? (
                <SummonLayer summonId={summonId} items={summonItems} />
              ) : null}
              <ParticipantPresenceLayer />
            </div>
          </div>
        </div>
      </div>

      <CanvasControlPalette
        onSummon={onSummon}
        onReset={onReset}
        onHome={onHome}
        canText={canText}
        canDraw={canDraw}
        canMark={canMark}
        canSummon={canSummon}
        summonActive={summonActive}
        isSummonOwner={isSummonOwner}
        canReset={canReset}
      />
    </>
  );
}
