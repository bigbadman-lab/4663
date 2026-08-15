"use client";

/**
 * RADAR alerts sit in the home region (world), not inside the movable card.
 * Separate module so PlayHTML CanMoveElement is not pulled into the SSR fallback
 * via pons-monitoring-object.
 */

import { RadarAlertObject } from "@/components/canvas/radar-alert-object";
import { usePonsMonitoringPanelOpen } from "@/components/canvas/pons-monitoring-panel-state";
import { useContinuationWatchlist } from "@/components/canvas/use-continuation-watchlist";

export function RadarAlertLayer() {
  const { alerts } = useContinuationWatchlist();
  const { openToToken } = usePonsMonitoringPanelOpen();

  if (alerts.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[16]" data-4663-radar-alerts>
      {alerts.map((alert) => (
        <RadarAlertObject
          key={alert.eventId}
          alert={alert}
          onOpen={openToToken}
        />
      ))}
    </div>
  );
}
