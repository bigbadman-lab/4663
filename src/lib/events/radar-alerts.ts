/**
 * Live RADAR alert detection from visible watchlist tokens[] (poll-diff).
 * First successful visible set seeds seen ids — no historical alerts.
 * Alerts mean: newly appeared ON OUR RADAR (top-5 membership) this session.
 */

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
  leftPct: number;
  topPct: number;
};

/** Sparse spawn points in home region (avoid hero / dock / monitoring card). */
export const RADAR_ALERT_SLOTS: readonly { leftPct: number; topPct: number }[] =
  [
    { leftPct: 68, topPct: 38 },
    { leftPct: 78, topPct: 58 },
    { leftPct: 58, topPct: 62 },
    { leftPct: 74, topPct: 48 },
  ] as const;

export function radarAlertSlotForEventId(eventId: string): {
  leftPct: number;
  topPct: number;
} {
  let hash = 0;
  for (let i = 0; i < eventId.length; i += 1) {
    hash = (hash * 31 + eventId.charCodeAt(i)) >>> 0;
  }
  return RADAR_ALERT_SLOTS[hash % RADAR_ALERT_SLOTS.length]!;
}

/**
 * Pure poll-diff on visible RADAR membership (tokens[]):
 * - First observation seeds seen eventIds → zero alerts
 * - Later unseen eventIds each emit one alert (tokens array order)
 * - Reorder / exit does not alert; seen ids are never removed (no re-entry alert)
 */
export function diffRadarVisibleTokens(input: {
  previousSeen: ReadonlySet<string>;
  seeded: boolean;
  tokens: readonly RadarVisibleTokenInput[];
  nowMs: number;
  lifetimeMs?: number;
}): {
  nextSeen: Set<string>;
  seeded: boolean;
  newAlerts: RadarAlert[];
} {
  const lifetimeMs = input.lifetimeMs ?? RADAR_ALERT_LIFETIME_MS;
  const nextSeen = new Set(input.previousSeen);
  const newAlerts: RadarAlert[] = [];

  if (!input.seeded) {
    for (const t of input.tokens) {
      nextSeen.add(t.eventId);
    }
    return { nextSeen, seeded: true, newAlerts };
  }

  for (const t of input.tokens) {
    if (nextSeen.has(t.eventId)) continue;
    nextSeen.add(t.eventId);
    const slot = radarAlertSlotForEventId(t.eventId);
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
