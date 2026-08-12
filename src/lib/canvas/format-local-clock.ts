/**
 * Browser-local clock display for canvas chrome.
 * Pure formatting — no timezone APIs.
 */

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

/** `12 AUG 2026 · 13:08:42` — local date + 24h time with seconds. */
export function formatLocalClock(date: Date): string {
  const day = String(date.getDate());
  const month = MONTHS[date.getMonth()]!;
  const year = String(date.getFullYear());
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${day} ${month} ${year} · ${hh}:${mm}:${ss}`;
}
