/**
 * Validate EVM address string and return lowercase form.
 */

export function isValidEvmAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

export function parseEvmAddress(name: string, value: string | undefined): string {
  const raw = value?.trim();
  if (!raw) {
    throw new Error(
      `[4663-worker] missing required environment variable: ${name}`,
    );
  }
  if (!isValidEvmAddress(raw)) {
    throw new Error(
      `[4663-worker] ${name} must be a 20-byte 0x address, got invalid value`,
    );
  }
  return raw.toLowerCase();
}
