/**
 * Client SNAPSHOT PNG upload — one file, no remote URL ingestion.
 */

import { CHAIN_ID } from "@/lib/pons/constants";
import {
  SNAPSHOT_API_PATH,
  type CanvasSnapshotObject,
} from "@/lib/social/canvas-snapshot";

export type UploadSnapshotPngResult =
  | { ok: true; imageUrl: string; width: number; height: number }
  | { ok: false; error: string };

export async function uploadSnapshotPng(input: {
  blob: Blob;
  sessionId: string;
  chainId?: number;
  fetch?: typeof fetch;
}): Promise<UploadSnapshotPngResult> {
  if (input.blob.size === 0) {
    return { ok: false, error: "Snapshot PNG is empty." };
  }
  const body = new FormData();
  body.set("chainId", String(input.chainId ?? CHAIN_ID));
  body.set("sessionId", input.sessionId);
  body.set("file", input.blob, "snapshot.png");

  const fetchImpl = input.fetch ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(SNAPSHOT_API_PATH, {
      method: "POST",
      body,
    });
  } catch {
    return { ok: false, error: "Snapshot upload failed." };
  }

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    return { ok: false, error: "Snapshot upload failed." };
  }
  if (!response.ok || json === null || typeof json !== "object") {
    const error =
      json !== null &&
      typeof json === "object" &&
      "error" in json &&
      typeof (json as { error: unknown }).error === "string"
        ? (json as { error: string }).error
        : "Snapshot upload failed.";
    return { ok: false, error };
  }
  const record = json as Record<string, unknown>;
  if (record.ok !== true || typeof record.imageUrl !== "string") {
    return { ok: false, error: "Snapshot upload failed." };
  }
  const width = typeof record.width === "number" ? record.width : 0;
  const height = typeof record.height === "number" ? record.height : 0;
  return {
    ok: true,
    imageUrl: record.imageUrl,
    width,
    height,
  };
}

export type SnapshotPlacePlan = {
  imageUrl: string;
  leftPct: number;
  topPct: number;
  widthPct: number;
  aspectRatio: number;
};

/** True when PLACE already created this local capture (duplicate click). */
export function snapshotAlreadyPlaced(
  snapshots: readonly CanvasSnapshotObject[],
  imageUrl: string,
): boolean {
  return snapshots.some((item) => item.imageUrl === imageUrl);
}
