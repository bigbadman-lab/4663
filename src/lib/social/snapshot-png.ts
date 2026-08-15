/**
 * PNG bytes validation for SNAPSHOT uploads (client + server).
 */

export const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** 8 MiB — covers 2× retina viewport PNGs without becoming a generic dump. */
export const SNAPSHOT_MAX_BYTES = 8 * 1024 * 1024;

export const SNAPSHOT_MAX_EDGE_PX = 4096 as const;

export function isPngMagic(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_MAGIC.length) return false;
  return PNG_MAGIC.every((value, index) => bytes[index] === value);
}

export function parsePngIhderSize(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const width =
    ((bytes[16]! << 24) | (bytes[17]! << 16) | (bytes[18]! << 8) | bytes[19]!) >>>
    0;
  const height =
    ((bytes[20]! << 24) | (bytes[21]! << 16) | (bytes[22]! << 8) | bytes[23]!) >>>
    0;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

export type ValidateSnapshotPngResult =
  | { ok: true; width: number; height: number }
  | { ok: false; error: string };

export function validateSnapshotPngBytes(
  bytes: Uint8Array,
): ValidateSnapshotPngResult {
  if (bytes.byteLength === 0) {
    return { ok: false, error: "empty_png" };
  }
  if (bytes.byteLength > SNAPSHOT_MAX_BYTES) {
    return { ok: false, error: "too_large" };
  }
  if (!isPngMagic(bytes)) {
    return { ok: false, error: "not_png" };
  }
  const size = parsePngIhderSize(bytes);
  if (!size) {
    return { ok: false, error: "invalid_png" };
  }
  if (size.width > SNAPSHOT_MAX_EDGE_PX || size.height > SNAPSHOT_MAX_EDGE_PX) {
    return { ok: false, error: "too_large" };
  }
  return { ok: true, width: size.width, height: size.height };
}
