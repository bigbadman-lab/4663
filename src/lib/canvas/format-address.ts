/**
 * Shorten EVM addresses for display. Copy paths must use the full address.
 */

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function formatShortAddress(address: string): string {
  const normalized = address.trim();
  if (!ADDRESS_RE.test(normalized)) return normalized;
  const lower = normalized.toLowerCase();
  return `${lower.slice(0, 6)}…${lower.slice(-4)}`;
}
