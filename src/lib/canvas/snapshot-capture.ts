/**
 * Capture the visible canvas viewport to a PNG Blob.
 * Uses html-to-image (SVG foreignObject + canvas) — no camera move.
 */

import { toBlob } from "html-to-image";
import {
  isSnapshotCaptureIncludedNode,
  SNAPSHOT_CAPTURE_ROOT_SELECTOR,
} from "@/lib/canvas/snapshot-exclude";
import { parsePngIhderSize } from "@/lib/social/snapshot-png";

export const SNAPSHOT_MAX_PIXEL_RATIO = 2 as const;

/** 1×1 transparent PNG — remote LINK/TOKEN/OG images must not abort capture. */
export const SNAPSHOT_IMAGE_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" as const;

export type SnapshotCaptureResult =
  | {
      ok: true;
      blob: Blob;
      width: number;
      height: number;
      pixelRatio: number;
    }
  | { ok: false; error: string };

export type SnapshotToBlob = (
  node: HTMLElement,
  options: {
    pixelRatio: number;
    cacheBust: boolean;
    backgroundColor: string;
    filter: (node: HTMLElement) => boolean;
    width: number;
    height: number;
    imagePlaceholder?: string;
    onImageErrorHandler?: OnErrorEventHandler;
  },
) => Promise<Blob | null>;

export function resolveSnapshotPixelRatio(
  devicePixelRatio: number | undefined,
): number {
  if (
    typeof devicePixelRatio !== "number" ||
    !Number.isFinite(devicePixelRatio) ||
    devicePixelRatio <= 0
  ) {
    return 1;
  }
  return Math.min(SNAPSHOT_MAX_PIXEL_RATIO, devicePixelRatio);
}

export function resolveCanvasCaptureBackground(
  doc: Document = document,
): string {
  const fromVar = doc.documentElement.style.getPropertyValue("--canvas-bg").trim();
  if (fromVar) return fromVar;
  try {
    const computed = doc.defaultView
      ?.getComputedStyle(doc.documentElement)
      .getPropertyValue("--canvas-bg")
      .trim();
    if (computed) return computed;
  } catch {
    // ignore
  }
  return "#ffffff";
}

export function findSnapshotCaptureRoot(
  doc: Document = document,
): HTMLElement | null {
  const node = doc.querySelector(SNAPSHOT_CAPTURE_ROOT_SELECTOR);
  if (node == null || typeof node !== "object") return null;
  if (!("clientWidth" in node) || !("clientHeight" in node)) return null;
  return node as HTMLElement;
}

async function blobPixelSize(
  blob: Blob,
): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      if (size.width > 0 && size.height > 0) return size;
    } catch {
      // fall through
    }
  }
  return parsePngIhderSize(new Uint8Array(await blob.arrayBuffer()));
}

export async function captureVisibleCanvasViewport(input?: {
  document?: Document;
  toBlob?: SnapshotToBlob;
  pixelRatio?: number;
}): Promise<SnapshotCaptureResult> {
  const doc = input?.document ?? document;
  const root = findSnapshotCaptureRoot(doc);
  if (!root) {
    return { ok: false, error: "Canvas viewport is not available." };
  }

  const width = root.clientWidth;
  const height = root.clientHeight;
  if (width <= 0 || height <= 0) {
    return { ok: false, error: "Canvas viewport has no size." };
  }

  const pixelRatio = resolveSnapshotPixelRatio(
    input?.pixelRatio ?? doc.defaultView?.devicePixelRatio,
  );
  const render = input?.toBlob ?? toBlob;

  let blob: Blob | null = null;
  try {
    blob = await render(root, {
      pixelRatio,
      cacheBust: true,
      backgroundColor: resolveCanvasCaptureBackground(doc),
      filter: (node) => isSnapshotCaptureIncludedNode(node),
      width,
      height,
      imagePlaceholder: SNAPSHOT_IMAGE_PLACEHOLDER,
      onImageErrorHandler: () => undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Snapshot capture failed.";
    return { ok: false, error: message };
  }

  if (!blob || blob.size === 0) {
    return { ok: false, error: "Snapshot capture produced an empty image." };
  }

  const pngBlob =
    blob.type === "image/png"
      ? blob
      : new Blob([blob], { type: "image/png" });

  const size = await blobPixelSize(pngBlob);
  if (!size) {
    return { ok: false, error: "Snapshot PNG could not be measured." };
  }

  return {
    ok: true,
    blob: pngBlob,
    width: size.width,
    height: size.height,
    pixelRatio,
  };
}
