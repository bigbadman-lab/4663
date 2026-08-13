/**
 * Compact relative time labels for monitoring UI (local presentation only).
 */

export function formatRelativeTimeAgo(
  isoTimestamp: string,
  nowMs: number = Date.now(),
): string {
  const then = Date.parse(isoTimestamp);
  if (Number.isNaN(then)) return "—";
  const deltaSec = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) return `${deltaMin}m ago`;
  const deltaHr = Math.floor(deltaMin / 60);
  if (deltaHr < 48) return `${deltaHr}h ago`;
  const deltaDay = Math.floor(deltaHr / 24);
  return `${deltaDay}d ago`;
}
