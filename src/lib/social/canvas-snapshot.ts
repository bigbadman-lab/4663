/**
 * Canvas SNAPSHOT PlayHTML objects — durable image URL, world % placement.
 * Never store data:/blob: URLs in page data.
 */

import {
  clampWorldPct,
  dockCreateWorldPct,
  visibleWorldSize,
  WORLD_WIDTH_PX,
  type CanvasCamera,
  type ViewportRect,
  type WorldPct,
} from "@/lib/canvas/world-camera";
import {
  isUuid,
  normalizeSessionId,
} from "@/lib/presence/session-id";

export const CANVAS_SNAPSHOTS_PAGE_DATA_NAME =
  "4663-canvas-snapshots" as const;

export const SNAPSHOT_API_PATH = "/api/social/snapshots" as const;

export const SNAPSHOT_MAX_OBJECTS = 40 as const;

/** Initial placed width as a fraction of the currently visible world width. */
export const SNAPSHOT_VIEWPORT_WIDTH_FRAC = 0.22 as const;

export const SNAPSHOT_WIDTH_PCT_MIN = 4 as const;
export const SNAPSHOT_WIDTH_PCT_MAX = 40 as const;
export const SNAPSHOT_ASPECT_RATIO_MIN = 0.1 as const;
export const SNAPSHOT_ASPECT_RATIO_MAX = 10 as const;

export type CanvasSnapshotObject = {
  snapshotId: string;
  ownerSessionId: string;
  imageUrl: string;
  widthPct: number;
  aspectRatio: number;
  leftPct: number;
  topPct: number;
  createdAt: string;
};

export type CanvasSnapshotsPageData = {
  snapshots: CanvasSnapshotObject[];
};

export const EMPTY_CANVAS_SNAPSHOTS_PAGE_DATA: CanvasSnapshotsPageData = {
  snapshots: [],
};

export function playhtmlSnapshotElementId(snapshotId: string): string {
  return `4663-snapshot-${snapshotId}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isDurableSnapshotImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length < 16 || trimmed.length > 2048) return false;
  if (/^(data:|blob:)/i.test(trimmed)) return false;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    return /\/storage\/v1\/object\/public\/snapshots\/\d+\/[0-9a-f-]{36}\.png$/i.test(
      url.pathname,
    );
  } catch {
    return false;
  }
}

export function normalizeSnapshotAspectRatio(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value < SNAPSHOT_ASPECT_RATIO_MIN || value > SNAPSHOT_ASPECT_RATIO_MAX) {
    return null;
  }
  return value;
}

export function clampSnapshotWidthPct(value: number): number {
  if (!Number.isFinite(value)) return 12;
  return Math.min(
    SNAPSHOT_WIDTH_PCT_MAX,
    Math.max(SNAPSHOT_WIDTH_PCT_MIN, value),
  );
}

export function snapshotPlacementFromViewport(input: {
  viewport: ViewportRect;
  camera: CanvasCamera;
  pixelWidth: number;
  pixelHeight: number;
  frac?: { x: number; y: number };
}): {
  origin: WorldPct;
  widthPct: number;
  aspectRatio: number;
} | null {
  if (
    !Number.isFinite(input.pixelWidth) ||
    !Number.isFinite(input.pixelHeight) ||
    input.pixelWidth <= 0 ||
    input.pixelHeight <= 0
  ) {
    return null;
  }
  const aspectRatio = normalizeSnapshotAspectRatio(
    input.pixelWidth / input.pixelHeight,
  );
  if (aspectRatio === null) return null;

  const origin = dockCreateWorldPct(
    input.viewport,
    input.camera,
    input.frac ?? { x: 0.5, y: 0.5 },
  );
  const visible = visibleWorldSize(
    input.viewport.width,
    input.viewport.height,
    input.camera.scale,
  );
  const targetWorldPx = visible.width * SNAPSHOT_VIEWPORT_WIDTH_FRAC;
  const widthPct = clampSnapshotWidthPct(
    (targetWorldPx / WORLD_WIDTH_PX) * 100,
  );
  return { origin, widthPct, aspectRatio };
}

export function normalizeCanvasSnapshotObject(
  raw: unknown,
): CanvasSnapshotObject | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isUuid(record.snapshotId)) return null;
  if (!isUuid(record.ownerSessionId)) return null;
  if (!isDurableSnapshotImageUrl(record.imageUrl)) return null;
  if (!isFiniteNumber(record.leftPct) || !isFiniteNumber(record.topPct)) {
    return null;
  }
  if (!isFiniteNumber(record.widthPct)) return null;
  if (record.leftPct < -5 || record.leftPct > 105) return null;
  if (record.topPct < -5 || record.topPct > 105) return null;
  if (
    record.widthPct < SNAPSHOT_WIDTH_PCT_MIN ||
    record.widthPct > SNAPSHOT_WIDTH_PCT_MAX
  ) {
    return null;
  }
  const aspectRatio = normalizeSnapshotAspectRatio(
    Number(record.aspectRatio),
  );
  if (aspectRatio === null) return null;
  if (typeof record.createdAt !== "string" || record.createdAt.trim() === "") {
    return null;
  }
  if (!Number.isFinite(Date.parse(record.createdAt))) return null;

  return {
    snapshotId: normalizeSessionId(record.snapshotId),
    ownerSessionId: normalizeSessionId(record.ownerSessionId),
    imageUrl: record.imageUrl.trim(),
    widthPct: clampSnapshotWidthPct(record.widthPct),
    aspectRatio,
    leftPct: clampWorldPct(record.leftPct),
    topPct: clampWorldPct(record.topPct),
    createdAt: record.createdAt,
  };
}

export function normalizeCanvasSnapshotsPageData(
  raw: unknown,
): CanvasSnapshotsPageData {
  if (raw === null || typeof raw !== "object") {
    return { snapshots: [] };
  }
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.snapshots)) {
    return { snapshots: [] };
  }
  const snapshots: CanvasSnapshotObject[] = [];
  const seen = new Set<string>();
  for (const item of record.snapshots) {
    const next = normalizeCanvasSnapshotObject(item);
    if (!next) continue;
    if (seen.has(next.snapshotId)) continue;
    seen.add(next.snapshotId);
    snapshots.push(next);
    if (snapshots.length >= SNAPSHOT_MAX_OBJECTS) break;
  }
  return { snapshots };
}

export function upsertCanvasSnapshot(
  data: CanvasSnapshotsPageData,
  snapshot: CanvasSnapshotObject,
): CanvasSnapshotsPageData {
  const next = data.snapshots.filter((item) => item.snapshotId !== snapshot.snapshotId);
  next.push(snapshot);
  if (next.length <= SNAPSHOT_MAX_OBJECTS) {
    return { snapshots: next };
  }
  return { snapshots: next.slice(next.length - SNAPSHOT_MAX_OBJECTS) };
}

export function removeCanvasSnapshotsByOwner(
  data: CanvasSnapshotsPageData,
  ownerSessionId: string,
): CanvasSnapshotsPageData {
  const owner = normalizeSessionId(ownerSessionId);
  return {
    snapshots: data.snapshots.filter((item) => item.ownerSessionId !== owner),
  };
}

export function retainCanvasSnapshotsForPresentOwners(
  data: CanvasSnapshotsPageData,
  presentSessionIds: ReadonlySet<string>,
): CanvasSnapshotsPageData {
  return {
    snapshots: data.snapshots.filter((item) =>
      presentSessionIds.has(item.ownerSessionId),
    ),
  };
}

export function isSnapshotPageDataWritable(input: {
  isLoading: boolean;
  isProviderMissing: boolean;
}): boolean {
  return !input.isLoading && !input.isProviderMissing;
}

export type CreateCanvasSnapshotInput = {
  ownerSessionId: string;
  imageUrl: string;
  leftPct: number;
  topPct: number;
  widthPct: number;
  aspectRatio: number;
  now?: () => Date;
  randomUUID?: () => string;
};

export type CreateCanvasSnapshotResult =
  | { ok: true; snapshot: CanvasSnapshotObject }
  | { ok: false; error: string };

export function createCanvasSnapshotObject(
  input: CreateCanvasSnapshotInput,
): CreateCanvasSnapshotResult {
  if (!isUuid(input.ownerSessionId)) {
    return { ok: false, error: "Invalid session." };
  }
  if (!isDurableSnapshotImageUrl(input.imageUrl)) {
    return { ok: false, error: "Invalid snapshot image URL." };
  }
  const aspectRatio = normalizeSnapshotAspectRatio(input.aspectRatio);
  if (aspectRatio === null) {
    return { ok: false, error: "Invalid snapshot aspect ratio." };
  }
  const randomUUID = input.randomUUID ?? (() => crypto.randomUUID());
  const now = input.now ?? (() => new Date());
  return {
    ok: true,
    snapshot: {
      snapshotId: normalizeSessionId(randomUUID()),
      ownerSessionId: normalizeSessionId(input.ownerSessionId),
      imageUrl: input.imageUrl.trim(),
      widthPct: clampSnapshotWidthPct(input.widthPct),
      aspectRatio,
      leftPct: clampWorldPct(input.leftPct),
      topPct: clampWorldPct(input.topPct),
      createdAt: now().toISOString(),
    },
  };
}

export type CommitSnapshotPublishResult =
  | { ok: true; pageData: CanvasSnapshotsPageData; snapshot: CanvasSnapshotObject }
  | { ok: false; reason: "not-ready" | "rejected" };

export function commitSnapshotPublish(input: {
  previous: CanvasSnapshotsPageData;
  snapshot: CanvasSnapshotObject;
  ready: boolean;
}): CommitSnapshotPublishResult {
  if (!input.ready) {
    return { ok: false, reason: "not-ready" };
  }
  const snapshot = normalizeCanvasSnapshotObject(input.snapshot);
  if (!snapshot) {
    return { ok: false, reason: "rejected" };
  }
  return {
    ok: true,
    snapshot,
    pageData: upsertCanvasSnapshot(
      normalizeCanvasSnapshotsPageData(input.previous),
      snapshot,
    ),
  };
}
