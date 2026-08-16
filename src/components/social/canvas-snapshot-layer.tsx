"use client";

/**
 * PlayHTML SNAPSHOT layer + preview orchestration.
 * Capture stays local until PLACE uploads one PNG and writes page data.
 */

import { usePageData, usePlayContext } from "@playhtml/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SnapshotPreview } from "@/components/canvas/snapshot-preview";
import { CanvasSnapshotObjectView } from "@/components/social/canvas-snapshot-object";
import { getCanvasPlacementSnapshot } from "@/components/canvas/use-canvas-camera";
import { captureVisibleCanvasViewport } from "@/lib/canvas/snapshot-capture";
import { downloadSnapshotBlob } from "@/lib/canvas/snapshot-download";
import { formatSnapshotFilename } from "@/lib/canvas/snapshot-filename";
import {
  beginSnapshotIfNamed,
  registerSnapshotActions,
} from "@/lib/canvas/snapshot-actions";
import { CHAIN_ID } from "@/lib/pons/constants";
import {
  CANVAS_SNAPSHOTS_PAGE_DATA_NAME,
  commitSnapshotPublish,
  createCanvasSnapshotObject,
  EMPTY_CANVAS_SNAPSHOTS_PAGE_DATA,
  isSnapshotPageDataWritable,
  normalizeCanvasSnapshotsPageData,
  removeCanvasSnapshotsByOwner,
  retainCanvasSnapshotsForPresentOwners,
  snapshotPlacementFromViewport,
  type CanvasSnapshotsPageData,
} from "@/lib/social/canvas-snapshot";
import { registerSessionEndedHandler } from "@/lib/social/session-cleanup";
import { registerSessionContentResetHandler } from "@/lib/social/session-content-reset";
import {
  snapshotAlreadyPlaced,
  uploadSnapshotPng,
} from "@/lib/social/snapshot-upload";
import { useParticipation } from "@/lib/social/use-participation";

type PreviewState = {
  blob: Blob;
  objectUrl: string;
  width: number;
  height: number;
};

export function CanvasSnapshotLayer() {
  const { isLoading, isProviderMissing } = usePlayContext();
  const { self, isParticipating, participants, status } =
    useParticipation();
  const [pageData, setPageData] = usePageData<CanvasSnapshotsPageData>(
    CANVAS_SNAPSHOTS_PAGE_DATA_NAME,
    EMPTY_CANVAS_SNAPSHOTS_PAGE_DATA,
  );
  const pageDataRef = useRef(pageData);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capturingRef = useRef(false);
  const placingRef = useRef(false);
  const previewRef = useRef<PreviewState | null>(null);

  useEffect(() => {
    pageDataRef.current = pageData;
  }, [pageData]);

  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  const writable = isSnapshotPageDataWritable({
    isLoading,
    isProviderMissing,
  });

  const writePageData = useCallback(
    (next: CanvasSnapshotsPageData) => {
      if (!writable) return;
      setPageData(next);
    },
    [setPageData, writable],
  );

  const closePreview = useCallback(() => {
    const current = previewRef.current;
    if (current) URL.revokeObjectURL(current.objectUrl);
    previewRef.current = null;
    setPreview(null);
    setError(null);
    setPlacing(false);
    placingRef.current = false;
  }, []);

  const captureViewport = useCallback(async () => {
    if (capturingRef.current || placingRef.current) return;
    if (previewRef.current) return;
    capturingRef.current = true;
    setError(null);
    const result = await captureVisibleCanvasViewport();
    capturingRef.current = false;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const objectUrl = URL.createObjectURL(result.blob);
    const next = {
      blob: result.blob,
      objectUrl,
      width: result.width,
      height: result.height,
    };
    previewRef.current = next;
    setPreview(next);
  }, []);

  const startCapture = useCallback(() => {
    beginSnapshotIfNamed({
      isNamedParticipant: Boolean(isParticipating && self),
      onCapture: () => {
        void captureViewport();
      },
    });
  }, [captureViewport, isParticipating, self]);

  useEffect(() => {
    return registerSnapshotActions({
      startCapture,
      isBusy: () =>
        capturingRef.current ||
        placingRef.current ||
        previewRef.current !== null,
    });
  }, [startCapture]);

  useEffect(() => {
    const clearOwned = (sessionId: string) => {
      writePageData(
        removeCanvasSnapshotsByOwner(
          normalizeCanvasSnapshotsPageData(pageDataRef.current),
          sessionId,
        ),
      );
    };
    const unsubLeave = registerSessionEndedHandler(({ sessionId }) => {
      clearOwned(sessionId);
    });
    const unsubReset = registerSessionContentResetHandler(({ sessionId }) => {
      clearOwned(sessionId);
    });
    return () => {
      unsubLeave();
      unsubReset();
    };
  }, [writePageData]);

  useEffect(() => {
    if (status === "connecting" || status === "error") return;
    const present = new Set(participants.map((p) => p.sessionId));
    if (self) present.add(self.sessionId);
    const current = normalizeCanvasSnapshotsPageData(pageDataRef.current);
    if (current.snapshots.length === 0) return;
    const next = retainCanvasSnapshotsForPresentOwners(current, present);
    if (next.snapshots.length !== current.snapshots.length) {
      writePageData(next);
    }
  }, [participants, self, status, writePageData]);

  useEffect(() => {
    return () => {
      const current = previewRef.current;
      if (current) URL.revokeObjectURL(current.objectUrl);
    };
  }, []);

  const onDownload = () => {
    const current = previewRef.current;
    if (!current) return;
    downloadSnapshotBlob(current.blob, formatSnapshotFilename());
  };

  const onPlace = async () => {
    const current = previewRef.current;
    if (!current) return;
    if (placingRef.current) return;
    if (!self) {
      setError("Enter to place on the canvas.");
      return;
    }
    if (!writable) {
      setError("Canvas is not ready to publish. Download is still available.");
      return;
    }

    const snapshots = normalizeCanvasSnapshotsPageData(
      pageDataRef.current,
    ).snapshots;
    // Same local capture cannot upload twice.
    placingRef.current = true;
    setPlacing(true);
    setError(null);

    const uploaded = await uploadSnapshotPng({
      blob: current.blob,
      sessionId: self.sessionId,
      chainId: CHAIN_ID,
    });
    if (!uploaded.ok) {
      placingRef.current = false;
      setPlacing(false);
      setError(uploaded.error);
      return;
    }
    if (snapshotAlreadyPlaced(snapshots, uploaded.imageUrl)) {
      placingRef.current = false;
      setPlacing(false);
      setError("Snapshot is already on the canvas.");
      return;
    }

    const placementSnap = getCanvasPlacementSnapshot();
    if (!placementSnap) {
      placingRef.current = false;
      setPlacing(false);
      setError("Canvas view is not ready. Download is still available.");
      return;
    }
    const pixelWidth = uploaded.width || current.width;
    const pixelHeight = uploaded.height || current.height;
    const placed = snapshotPlacementFromViewport({
      viewport: placementSnap.viewport,
      camera: placementSnap.camera,
      pixelWidth,
      pixelHeight,
    });
    if (!placed) {
      placingRef.current = false;
      setPlacing(false);
      setError("Could not place this snapshot.");
      return;
    }

    const created = createCanvasSnapshotObject({
      ownerSessionId: self.sessionId,
      imageUrl: uploaded.imageUrl,
      leftPct: placed.origin.leftPct,
      topPct: placed.origin.topPct,
      widthPct: placed.widthPct,
      aspectRatio: placed.aspectRatio,
    });
    if (!created.ok) {
      placingRef.current = false;
      setPlacing(false);
      setError(created.error);
      return;
    }

    const published = commitSnapshotPublish({
      previous: pageDataRef.current,
      snapshot: created.snapshot,
      ready: writable,
    });
    if (!published.ok) {
      placingRef.current = false;
      setPlacing(false);
      setError("Could not publish snapshot. Download is still available.");
      return;
    }

    writePageData(published.pageData);
    closePreview();
  };

  const snapshots = normalizeCanvasSnapshotsPageData(pageData).snapshots;
  const previewNode =
    preview && typeof document !== "undefined"
      ? createPortal(
          <SnapshotPreview
            objectUrl={preview.objectUrl}
            width={preview.width}
            height={preview.height}
            placing={placing}
            error={error}
            canPlace={!!self}
            onDownload={onDownload}
            onPlace={() => {
              void onPlace();
            }}
            onCancel={() => {
              if (placingRef.current) return;
              closePreview();
            }}
          />,
          document.body,
        )
      : error && !preview && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-30 flex items-end justify-center pb-[calc(env(safe-area-inset-bottom,0px)+7rem)] sm:items-center sm:pb-0"
              data-4663-snapshot-exclude=""
              data-4663-snapshot-capture-error
            >
              <div className="mx-2 border border-neutral-300 bg-white px-4 py-3 font-mono text-[11px] tracking-wide text-neutral-700 shadow-sm">
                <p role="alert">{error}</p>
                <button
                  type="button"
                  className="mt-2 text-neutral-500 hover:text-neutral-800"
                  data-4663-snapshot-error-dismiss
                  onClick={() => setError(null)}
                >
                  [ CANCEL ]
                </button>
              </div>
            </div>,
            document.body,
          )
        : null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[2]"
      data-4663-snapshot-layer
    >
      {snapshots.map((snapshot) => (
        <CanvasSnapshotObjectView
          key={snapshot.snapshotId}
          snapshot={snapshot}
          isOwner={self?.sessionId === snapshot.ownerSessionId}
          onDelete={(snapshotId) => {
            writePageData({
              snapshots: normalizeCanvasSnapshotsPageData(
                pageDataRef.current,
              ).snapshots.filter((item) => item.snapshotId !== snapshotId),
            });
          }}
        />
      ))}
      {previewNode}
    </div>
  );
}
