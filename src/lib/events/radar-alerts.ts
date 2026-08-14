/**
 * Live RADAR alert detection from watchlist recentQualifications (poll-diff).
 * First successful feed seeds seen ids — no historical alerts.
 */

export const RADAR_ALERT_LIFETIME_MS = 4 * 60 * 1000;

export type RadarQualificationInput = {
  eventId: string;
  tokenAddress: string;
  occurredAt: string;
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
 * Pure poll-diff: seed on first observation; emit one alert per new eventId.
 */
export function diffRadarQualifications(input: {
  previousSeen: ReadonlySet<string>;
  seeded: boolean;
  qualifications: readonly RadarQualificationInput[];
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
    for (const q of input.qualifications) {
      nextSeen.add(q.eventId);
    }
    return { nextSeen, seeded: true, newAlerts };
  }

  for (const q of input.qualifications) {
    if (nextSeen.has(q.eventId)) continue;
    nextSeen.add(q.eventId);
    const slot = radarAlertSlotForEventId(q.eventId);
    newAlerts.push({
      eventId: q.eventId,
      tokenAddress: q.tokenAddress,
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
