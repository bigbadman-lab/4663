/**
 * Live RADAR alert detection from visible watchlist tokens[] (poll-diff).
 * First successful visible set seeds seen ids — no historical alerts.
 * Alerts mean: newly appeared ON OUR RADAR (top-5 membership) this session.
 * Spawn positions are world % chosen inside the current local viewport.
 */

import {
  dockCreateWorldPct,
  homePctToWorldPct,
  type CanvasCamera,
  type ViewportRect,
  type WorldPct,
} from "@/lib/canvas/world-camera";

export const RADAR_ALERT_LIFETIME_MS = 4 * 60 * 1000;

/** Visible RADAR row used for membership-based alert detection. */
export type RadarVisibleTokenInput = {
  eventId: string;
  tokenAddress: string;
};

export type RadarAlert = {
  eventId: string;
  tokenAddress: string;
  createdAtMs: number;
  expiresAtMs: number;
  /** World % origin (PlayHTML / CanMoveElement), frozen at spawn. */
  leftPct: number;
  topPct: number;
};

/**
 * Fallback home-artboard slots → converted to world % when camera snapshot
 * is unavailable (tests / pre-mount). Not used for live viewport spawn.
 */
export const RADAR_ALERT_FALLBACK_HOME_SLOTS: readonly {
  leftPct: number;
  topPct: number;
}[] = [
  { leftPct: 68, topPct: 38 },
  { leftPct: 78, topPct: 58 },
  { leftPct: 58, topPct: 62 },
  { leftPct: 74, topPct: 48 },
] as const;

/** @deprecated Prefer radarAlertSpawnWorldPct — kept for tests/fallback hash. */
export const RADAR_ALERT_SLOTS = RADAR_ALERT_FALLBACK_HOME_SLOTS;

export function radarAlertFallbackWorldPct(
  eventId: string,
  index: number = 0,
): WorldPct {
  let hash = 0;
  for (let i = 0; i < eventId.length; i += 1) {
    hash = (hash * 31 + eventId.charCodeAt(i)) >>> 0;
  }
  const slot =
    RADAR_ALERT_FALLBACK_HOME_SLOTS[
      (hash + index) % RADAR_ALERT_FALLBACK_HOME_SLOTS.length
    ]!;
  return homePctToWorldPct(slot.leftPct, slot.topPct);
}

/** @deprecated Use radarAlertFallbackWorldPct (world %) or radarAlertSpawnWorldPct. */
export function radarAlertSlotForEventId(eventId: string): WorldPct {
  return radarAlertFallbackWorldPct(eventId, 0);
}

/**
 * Safe viewport fractions for the alert *center* (card ~11.5rem × ~14rem,
 * with -translate centering). Keeps the object clear of top chrome and the
 * bottom dock / contract cluster.
 */
export function radarAlertViewportSafeBand(viewportWidth: number): {
  left: number;
  right: number;
  top: number;
  bottom: number;
  preferredX: number;
  preferredY: number;
} {
  const narrow = viewportWidth < 640;
  if (narrow) {
    return {
      left: 0.28,
      right: 0.72,
      top: 0.22,
      bottom: 0.56,
      preferredX: 0.64,
      preferredY: 0.34,
    };
  }
  return {
    left: 0.22,
    right: 0.82,
    top: 0.18,
    bottom: 0.66,
    preferredX: 0.72,
    preferredY: 0.36,
  };
}

/**
 * Viewport-relative spawn → world % via the same screen→world path as dock create.
 * `index` staggers simultaneous alerts inside the safe band.
 */
export function radarAlertSpawnWorldPct(input: {
  viewport: ViewportRect;
  camera: CanvasCamera;
  index?: number;
}): WorldPct {
  const index = Math.max(0, Math.trunc(input.index ?? 0));
  const band = radarAlertViewportSafeBand(input.viewport.width);
  let fx = band.preferredX - (index % 3) * 0.07;
  let fy = band.preferredY + (index % 3) * 0.06 + Math.floor(index / 3) * 0.1;
  fx = Math.min(band.right, Math.max(band.left, fx));
  fy = Math.min(band.bottom, Math.max(band.top, fy));
  return dockCreateWorldPct(input.viewport, input.camera, { x: fx, y: fy });
}

export type RadarAlertPositionResolver = (
  eventId: string,
  index: number,
) => WorldPct;

/**
 * Pure poll-diff on visible RADAR membership (tokens[]):
 * - First observation seeds seen eventIds → zero alerts
 * - Later unseen eventIds each emit one alert (tokens array order)
 * - Reorder / exit does not alert; seen ids are never removed (no re-entry alert)
 * - Positions come from resolvePosition (viewport spawn) and are frozen on the alert
 */
export function diffRadarVisibleTokens(input: {
  previousSeen: ReadonlySet<string>;
  seeded: boolean;
  tokens: readonly RadarVisibleTokenInput[];
  nowMs: number;
  lifetimeMs?: number;
  resolvePosition?: RadarAlertPositionResolver;
}): {
  nextSeen: Set<string>;
  seeded: boolean;
  newAlerts: RadarAlert[];
} {
  const lifetimeMs = input.lifetimeMs ?? RADAR_ALERT_LIFETIME_MS;
  const nextSeen = new Set(input.previousSeen);
  const newAlerts: RadarAlert[] = [];
  const resolve =
    input.resolvePosition ??
    ((eventId: string, index: number) =>
      radarAlertFallbackWorldPct(eventId, index));

  if (!input.seeded) {
    for (const t of input.tokens) {
      nextSeen.add(t.eventId);
    }
    return { nextSeen, seeded: true, newAlerts };
  }

  for (const t of input.tokens) {
    if (nextSeen.has(t.eventId)) continue;
    nextSeen.add(t.eventId);
    const index = newAlerts.length;
    const slot = resolve(t.eventId, index);
    newAlerts.push({
      eventId: t.eventId,
      tokenAddress: t.tokenAddress,
      createdAtMs: input.nowMs,
      expiresAtMs: input.nowMs + lifetimeMs,
      leftPct: slot.leftPct,
      topPct: slot.topPct,
    });
  }

  return { nextSeen, seeded: true, newAlerts };
}

export function pruneExpiredRadarAlerts(
  alerts: readonly RadarAlert[],
  nowMs: number,
): RadarAlert[] {
  return alerts.filter((a) => a.expiresAtMs > nowMs);
}

/**
 * Apply a watchlist poll result to alert/seen state.
 *
 * While the document is hidden: update tokens only — do not advance seenIds or
 * create alerts, so the 4-minute timer cannot burn before the user can see them.
 * On the next visible poll, new membership alerts with full client lifetime.
 */
export function applyRadarWatchlistSnapshot(input: {
  previousSeen: ReadonlySet<string>;
  seeded: boolean;
  previousAlerts: readonly RadarAlert[];
  tokens: readonly RadarVisibleTokenInput[];
  nowMs: number;
  /** When false, skip membership alert emission and leave seenIds unchanged. */
  emitAlerts: boolean;
  lifetimeMs?: number;
  resolvePosition?: RadarAlertPositionResolver;
}): {
  nextSeen: Set<string>;
  seeded: boolean;
  alerts: RadarAlert[];
  /** Newly accepted alerts this snapshot (empty on seed / hidden). */
  newAlerts: RadarAlert[];
} {
  const pruned = pruneExpiredRadarAlerts(input.previousAlerts, input.nowMs);

  if (!input.seeded) {
    const seeded = diffRadarVisibleTokens({
      previousSeen: input.previousSeen,
      seeded: false,
      tokens: input.tokens,
      nowMs: input.nowMs,
      lifetimeMs: input.lifetimeMs,
      resolvePosition: input.resolvePosition,
    });
    return {
      nextSeen: seeded.nextSeen,
      seeded: true,
      alerts: pruned,
      newAlerts: [],
    };
  }

  if (!input.emitAlerts) {
    return {
      nextSeen: new Set(input.previousSeen),
      seeded: true,
      alerts: pruned,
      newAlerts: [],
    };
  }

  const diff = diffRadarVisibleTokens({
    previousSeen: input.previousSeen,
    seeded: true,
    tokens: input.tokens,
    nowMs: input.nowMs,
    lifetimeMs: input.lifetimeMs,
    resolvePosition: input.resolvePosition,
  });
  const alerts =
    diff.newAlerts.length === 0
      ? pruned
      : [...pruned, ...diff.newAlerts];
  return {
    nextSeen: diff.nextSeen,
    seeded: true,
    alerts,
    newAlerts: diff.newAlerts,
  };
}
