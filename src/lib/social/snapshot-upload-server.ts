/**
 * Server-side SNAPSHOT PNG store — service-role Storage only.
 */

import { CHAIN_ID } from "@/lib/pons/constants";
import { isUuid, normalizeSessionId } from "@/lib/presence/session-id";
import type { PresenceSupabase } from "@/lib/presence/supabase-server";
import { validateSnapshotPngBytes } from "@/lib/social/snapshot-png";

export const SNAPSHOT_STORAGE_BUCKET = "snapshots" as const;

export type StoreSnapshotPngInput = {
  bytes: Uint8Array;
  mimeType: string | null;
  chainId: unknown;
  sessionId: unknown;
  randomUUID?: () => string;
};

export type StoreSnapshotPngResult =
  | {
      ok: true;
      imageUrl: string;
      objectPath: string;
      width: number;
      height: number;
    }
  | { ok: false; error: string; status: number };

export function snapshotObjectPath(chainId: number, objectId: string): string {
  return `${chainId}/${objectId}.png`;
}

export async function storeSnapshotPng(
  supabase: PresenceSupabase,
  input: StoreSnapshotPngInput,
): Promise<StoreSnapshotPngResult> {
  const mime = (input.mimeType ?? "").split(";")[0]!.trim().toLowerCase();
  if (mime && mime !== "image/png") {
    return { ok: false, error: "not_png", status: 400 };
  }
  if (!isUuid(input.sessionId)) {
    return { ok: false, error: "invalid_session", status: 400 };
  }
  const sessionId = normalizeSessionId(String(input.sessionId));
  void sessionId;

  const chainId =
    typeof input.chainId === "string"
      ? Number(input.chainId)
      : input.chainId;
  if (chainId !== CHAIN_ID) {
    return { ok: false, error: "invalid_chain", status: 400 };
  }

  const png = validateSnapshotPngBytes(input.bytes);
  if (!png.ok) {
    return { ok: false, error: png.error, status: 400 };
  }

  const objectId = (input.randomUUID ?? (() => crypto.randomUUID()))();
  const objectPath = snapshotObjectPath(CHAIN_ID, objectId);
  const { error } = await supabase.storage
    .from(SNAPSHOT_STORAGE_BUCKET)
    .upload(objectPath, input.bytes, {
      contentType: "image/png",
      upsert: false,
      cacheControl: "31536000",
    });

  if (error) {
    return { ok: false, error: "upload_failed", status: 500 };
  }

  const { data } = supabase.storage
    .from(SNAPSHOT_STORAGE_BUCKET)
    .getPublicUrl(objectPath);

  if (!data?.publicUrl) {
    return { ok: false, error: "upload_failed", status: 500 };
  }

  return {
    ok: true,
    imageUrl: data.publicUrl,
    objectPath,
    width: png.width,
    height: png.height,
  };
}
