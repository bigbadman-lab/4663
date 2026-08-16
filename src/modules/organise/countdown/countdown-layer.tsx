"use client";

/**
 * COUNTDOWN instances for the Module Lab — PlayHTML page data, lab-namespaced.
 */

import { usePageData, usePlayContext } from "@playhtml/react";
import { useEffect, useRef } from "react";
import { getCanvasPlacementSnapshot } from "@/components/canvas/use-canvas-camera";
import { registerModuleLabActions } from "@/lib/modules/lab-actions";
import { registerLabBoardChildSource } from "@/lib/modules/lab-board-bridge";
import { dockCreateWorldPct } from "@/lib/canvas/world-camera";
import { CountdownObjectView } from "@/modules/organise/countdown/countdown-object";
import {
  addCountdownInstance,
  canCreateCountdownInstance,
  createCountdownInstance,
  EMPTY_MODULE_LAB_COUNTDOWNS_PAGE_DATA,
  isPlayhtmlPageDataWritable,
  MODULE_LAB_COUNTDOWNS_PAGE_DATA_NAME,
  nextCountdownSpawnPct,
  normalizeModuleLabCountdownsPageData,
  removeCountdownInstance,
  resetModuleLabCountdownsPageData,
  shiftCountdownOrigin,
  updateCountdownBoardId,
  updateCountdownColor,
  updateCountdownLabel,
  updateCountdownLocalDateTime,
  updateCountdownSize,
  type ModuleLabCountdownsPageData,
} from "@/modules/organise/countdown/countdown-state";

export function CountdownLayer() {
  const [pageData, setPageData] = usePageData<ModuleLabCountdownsPageData>(
    MODULE_LAB_COUNTDOWNS_PAGE_DATA_NAME,
    EMPTY_MODULE_LAB_COUNTDOWNS_PAGE_DATA,
  );
  const { isLoading: playhtmlLoading, isProviderMissing } = usePlayContext();
  const current = normalizeModuleLabCountdownsPageData(pageData);
  const writable = isPlayhtmlPageDataWritable({
    isLoading: playhtmlLoading,
    isProviderMissing,
  });
  const pageDataRef = useRef(pageData);
  const writableRef = useRef(writable);

  useEffect(() => {
    pageDataRef.current = pageData;
    writableRef.current = writable;
  }, [pageData, writable]);

  useEffect(() => {
    return registerLabBoardChildSource({
      kind: "countdown",
      ownedIds: (boardId) =>
        normalizeModuleLabCountdownsPageData(pageDataRef.current)
          .countdowns.filter((row) => row.boardId === boardId)
          .map((row) => row.id),
      setBoardId: (instanceId, boardId) => {
        if (!writableRef.current) return;
        const latest = normalizeModuleLabCountdownsPageData(
          pageDataRef.current,
        );
        const next = updateCountdownBoardId(latest, instanceId, boardId);
        pageDataRef.current = next;
        setPageData(next);
      },
      shiftOrigin: (instanceId, deltaLeftPct, deltaTopPct) => {
        if (!writableRef.current) return;
        const latest = normalizeModuleLabCountdownsPageData(
          pageDataRef.current,
        );
        const next = shiftCountdownOrigin(
          latest,
          instanceId,
          deltaLeftPct,
          deltaTopPct,
        );
        pageDataRef.current = next;
        setPageData(next);
      },
    });
  }, [setPageData]);

  useEffect(() => {
    return registerModuleLabActions({
      create: (moduleId) => {
        if (moduleId !== "countdown") return;
        if (!writableRef.current) return;
        const latest = normalizeModuleLabCountdownsPageData(
          pageDataRef.current,
        );
        if (!canCreateCountdownInstance(latest)) return;
        const snapshot = getCanvasPlacementSnapshot();
        const base =
          snapshot != null
            ? dockCreateWorldPct(snapshot.viewport, snapshot.camera)
            : { leftPct: 54, topPct: 46 };
        const origin = nextCountdownSpawnPct(latest.countdowns.length, base);
        const countdown = createCountdownInstance(origin);
        const next = addCountdownInstance(latest, countdown);
        pageDataRef.current = next;
        setPageData(next);
      },
      reset: () => {
        if (!writableRef.current) return;
        const empty = resetModuleLabCountdownsPageData();
        pageDataRef.current = empty;
        setPageData(empty);
      },
    });
  }, [setPageData]);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[2]"
      data-4663-countdown-layer
    >
      {current.countdowns.map((countdown) => (
        <CountdownObjectView
          key={countdown.id}
          countdown={countdown}
          onLabelChange={(countdownId, label) => {
            if (!writable) return;
            const latest = normalizeModuleLabCountdownsPageData(
              pageDataRef.current,
            );
            const next = updateCountdownLabel(latest, countdownId, label);
            pageDataRef.current = next;
            setPageData(next);
          }}
          onLocalDateTimeChange={(countdownId, date, time) => {
            if (!writable) return;
            const latest = normalizeModuleLabCountdownsPageData(
              pageDataRef.current,
            );
            const next = updateCountdownLocalDateTime(
              latest,
              countdownId,
              date,
              time,
            );
            pageDataRef.current = next;
            setPageData(next);
          }}
          onColorChange={(countdownId, color) => {
            if (!writable) return;
            const latest = normalizeModuleLabCountdownsPageData(
              pageDataRef.current,
            );
            const next = updateCountdownColor(latest, countdownId, color);
            pageDataRef.current = next;
            setPageData(next);
          }}
          onResize={(countdownId, size) => {
            if (!writable) return;
            const latest = normalizeModuleLabCountdownsPageData(
              pageDataRef.current,
            );
            const next = updateCountdownSize(latest, countdownId, size);
            pageDataRef.current = next;
            setPageData(next);
          }}
          onDelete={(countdownId) => {
            if (!writable) return;
            const latest = normalizeModuleLabCountdownsPageData(
              pageDataRef.current,
            );
            const next = removeCountdownInstance(latest, countdownId);
            pageDataRef.current = next;
            setPageData(next);
          }}
        />
      ))}
    </div>
  );
}
