"use client";

/**
 * Client-only PlayHTML tree (must not SSR — playhtml touches `document`).
 */

import { PlayProvider } from "@playhtml/react";
import { usePathname } from "next/navigation";
import { CanvasChrome } from "@/components/canvas/canvas-chrome";
import { CanvasSurface } from "@/components/canvas/canvas-surface";
import { useSummonController } from "@/components/canvas/use-summon-controller";
import type { SlottedLiveEvent } from "@/lib/canvas/slots";
import type { PublicEvent } from "@/lib/events/types";
import { useParticipation } from "@/lib/social/use-participation";

export type CanvasPlayTreeProps = {
  liveItems: readonly SlottedLiveEvent[];
  events: readonly PublicEvent[];
  nowMs: number;
};

function CanvasPlayTreeInner({
  liveItems,
  events,
  nowMs,
}: CanvasPlayTreeProps) {
  const { isParticipating, resetContent } = useParticipation();
  const summon = useSummonController(events, nowMs);

  return (
    <div
      className="relative min-h-dvh w-full overflow-x-hidden bg-white text-neutral-900"
      data-4663-canvas-root
    >
      <CanvasChrome />
      <CanvasSurface
        liveItems={liveItems}
        summonId={summon.summonId}
        summonItems={summon.items}
        onSummon={summon.onSummon}
        onDismissSummon={summon.onDismiss}
        onReset={() => {
          resetContent();
        }}
        canSummon={summon.canSummon}
        summonActive={summon.active !== null}
        isSummonOwner={summon.isOwner}
        canReset={isParticipating}
      />
    </div>
  );
}

export function CanvasPlayTree({ liveItems, events, nowMs }: CanvasPlayTreeProps) {
  const pathname = usePathname();

  return (
    <PlayProvider pathname={pathname ?? "/"}>
      <CanvasPlayTreeInner
        liveItems={liveItems}
        events={events}
        nowMs={nowMs}
      />
    </PlayProvider>
  );
}
