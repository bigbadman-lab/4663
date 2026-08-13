/**
 * Shorten EVM addresses for display. Copy paths must use the full address.
 */

/** Exact EVM address: 0x + 40 hex digits (not tx hashes). */
export const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Global matcher for standalone addresses inside free-flow text.
 * Negative lookahead avoids matching the leading 40 hex of a 64-char tx hash.
 */
export const EVM_ADDRESS_IN_TEXT_RE = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;

export function isEvmAddress(value: string): boolean {
  return EVM_ADDRESS_RE.test(value.trim());
}

export function formatShortAddress(address: string): string {
  const normalized = address.trim();
  if (!EVM_ADDRESS_RE.test(normalized)) return normalized;
  const lower = normalized.toLowerCase();
  return `${lower.slice(0, 6)}…${lower.slice(-4)}`;
}

export type TextEvmSegment =
  | { type: "text"; value: string }
  | { type: "address"; value: string };

/**
 * Split free-flow text into plain runs and validated EVM address runs.
 * Invalid / truncated hex and tx hashes remain plain text.
 */
export function splitTextWithEvmAddresses(body: string): TextEvmSegment[] {
  if (!body) return [{ type: "text", value: "" }];

  const segments: TextEvmSegment[] = [];
  const re = new RegExp(EVM_ADDRESS_IN_TEXT_RE.source, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(body)) !== null) {
    const address = match[0];
    if (!isEvmAddress(address)) continue;
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: body.slice(lastIndex, match.index) });
    }
    segments.push({ type: "address", value: address });
    lastIndex = match.index + address.length;
  }

  if (lastIndex < body.length) {
    segments.push({ type: "text", value: body.slice(lastIndex) });
  }

  if (segments.length === 0) {
    return [{ type: "text", value: body }];
  }
  return segments;
}
