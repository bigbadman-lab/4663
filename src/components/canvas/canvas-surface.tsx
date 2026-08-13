"use client";

/**
 * Main relative surface for live objects + movable PlayHTML objects.
 * Stable id is the PlayHTML movement bounds container.
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
import { EphemeralTextLayer } from "@/components/social/ephemeral-text-layer";
import { ParticipantPresenceLayer } from "@/components/social/participant-presence-layer";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/hero";
import type { SlottedLiveEvent } from "@/lib/canvas/slots";

export type CanvasSurfaceProps = {
  liveItems?: readonly SlottedLiveEvent[];
  pinnedItems?: readonly PinnedLayerItem[];
  summonId?: string | null;
  summonItems?: readonly SummonLayerItem[];
  onSummon?: () => void;
  onDismissSummon?: () => void;
  onReset?: () => void;
  canSummon?: boolean;
  summonActive?: boolean;
  isSummonOwner?: boolean;
  canReset?: boolean;
  isPinned?: (eventId: string) => boolean;
  onPin?: (
    eventId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
};

export function CanvasSurface({
  liveItems = [],
  pinnedItems = [],
  summonId = null,
  summonItems = [],
  onSummon,
  onDismissSummon,
  onReset,
  canSummon = false,
  summonActive = false,
  isSummonOwner = false,
  canReset = false,
  isPinned,
  onPin,
}: CanvasSurfaceProps) {
  return (
    <div
      id={PLAYHTML_CANVAS_BOUNDS_ID}
      className="absolute inset-0 z-10"
      data-4663-canvas-surface
    >
      <EphemeralTextLayer />
      <MovableLogo />
      <MovableHero />
      <MovableLiveEventLayer
        items={liveItems}
        isPinned={isPinned}
        onPin={onPin}
      />
      <PinnedPonsLayer items={pinnedItems} />
      {summonId ? (
        <SummonLayer summonId={summonId} items={summonItems} />
      ) : null}
      <ParticipantPresenceLayer />
      <CanvasControlPalette
        onSummon={onSummon}
        onDismissSummon={onDismissSummon}
        onReset={onReset}
        canSummon={canSummon}
        summonActive={summonActive}
        isSummonOwner={isSummonOwner}
        canReset={canReset}
      />
    </div>
  );
}
