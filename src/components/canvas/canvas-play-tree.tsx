"use client";

/**
 * Client-only PlayHTML tree (must not SSR — playhtml touches `document`).
 */

import { PlayProvider } from "@playhtml/react";
import { usePathname } from "next/navigation";
import { CanvasChrome } from "@/components/canvas/canvas-chrome";
import { CanvasSurface } from "@/components/canvas/canvas-surface";
import { useSummonController } from "@/components/canvas/use-summon-controller";
import type { PinnedLayerItem } from "@/components/canvas/pinned-pons-layer";
import type { SlottedLiveEvent } from "@/lib/canvas/slots";
import type { PublicEvent } from "@/lib/events/types";
import { useCanvasMarks } from "@/lib/social/use-canvas-marks";
import { useParticipation } from "@/lib/social/use-participation";

export type CanvasPlayTreeProps = {
  liveItems: readonly SlottedLiveEvent[];
  pinnedItems: readonly PinnedLayerItem[];
  events: readonly PublicEvent[];
  nowMs: number;
  isPinned: (eventId: string) => boolean;
  onPin: (
    eventId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onUnpin: (
    pinId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
};

function CanvasPlayTreeInner({
  liveItems,
  pinnedItems,
  events,
  nowMs,
  isPinned,
  onPin,
  onUnpin,
}: CanvasPlayTreeProps) {
  const { isParticipating, resetContent, self } = useParticipation();
  const summon = useSummonController(events, nowMs);
  const { hasMarkForSession } = useCanvasMarks();

  const canCreate = isParticipating && !!self;
  const canMark =
    canCreate && !!self && !hasMarkForSession(self.sessionId);

  return (
    <div
      className="relative min-h-dvh w-full overflow-x-hidden bg-[var(--canvas-bg,#ffffff)] text-[color:var(--canvas-fg,#171717)]"
      data-4663-canvas-root
    >
      <CanvasChrome />
      <CanvasSurface
        liveItems={liveItems}
        pinnedItems={pinnedItems}
        summonId={summon.summonId}
        summonItems={summon.items}
        onSummon={summon.onSummon}
        onReset={() => {
          resetContent();
        }}
        canText={canCreate}
        canDraw={canCreate}
        canMark={canMark}
        canSummon={summon.canSummon}
        summonActive={summon.active !== null}
        isSummonOwner={summon.isOwner}
        canReset={isParticipating}
        isPinned={isPinned}
        onPin={onPin}
        onUnpin={onUnpin}
      />
    </div>
  );
}

export function CanvasPlayTree(props: CanvasPlayTreeProps) {
  const pathname = usePathname();

  return (
    <PlayProvider pathname={pathname ?? "/"}>
      <CanvasPlayTreeInner {...props} />
    </PlayProvider>
  );
}
