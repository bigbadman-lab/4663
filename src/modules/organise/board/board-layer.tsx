"use client";

/**
 * BOARD instances for the Module Lab — PlayHTML page data, lab-namespaced.
 */

import { usePageData, usePlayContext } from "@playhtml/react";
import { useEffect, useRef } from "react";
import { getCanvasPlacementSnapshot } from "@/components/canvas/use-canvas-camera";
import { registerModuleLabActions } from "@/lib/modules/lab-actions";
import { detachLabBoardChildren } from "@/lib/modules/lab-board-bridge";
import { dockCreateWorldPct } from "@/lib/canvas/world-camera";
import { BoardObjectView } from "@/modules/organise/board/board-object";
import {
  addBoardInstance,
  canCreateBoardInstance,
  createBoardInstance,
  EMPTY_MODULE_LAB_BOARDS_PAGE_DATA,
  isPlayhtmlPageDataWritable,
  MODULE_LAB_BOARDS_PAGE_DATA_NAME,
  nextBoardSpawnPct,
  normalizeModuleLabBoardsPageData,
  removeBoardInstance,
  resetModuleLabBoardsPageData,
  updateBoardColor,
  updateBoardSize,
  updateBoardTitle,
  type ModuleLabBoardsPageData,
} from "@/modules/organise/board/board-state";

export function BoardLayer() {
  const [pageData, setPageData] = usePageData<ModuleLabBoardsPageData>(
    MODULE_LAB_BOARDS_PAGE_DATA_NAME,
    EMPTY_MODULE_LAB_BOARDS_PAGE_DATA,
  );
  const { isLoading: playhtmlLoading, isProviderMissing } = usePlayContext();
  const current = normalizeModuleLabBoardsPageData(pageData);
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
    return registerModuleLabActions({
      create: (moduleId) => {
        if (moduleId !== "board") return;
        if (!writableRef.current) return;
        const latest = normalizeModuleLabBoardsPageData(pageDataRef.current);
        if (!canCreateBoardInstance(latest)) return;
        const snapshot = getCanvasPlacementSnapshot();
        const base =
          snapshot != null
            ? dockCreateWorldPct(snapshot.viewport, snapshot.camera)
            : { leftPct: 48, topPct: 40 };
        const origin = nextBoardSpawnPct(latest.boards.length, base);
        const board = createBoardInstance(origin);
        const next = addBoardInstance(latest, board);
        pageDataRef.current = next;
        setPageData(next);
      },
      reset: () => {
        if (!writableRef.current) return;
        const empty = resetModuleLabBoardsPageData();
        pageDataRef.current = empty;
        setPageData(empty);
      },
    });
  }, [setPageData]);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[1]"
      data-4663-board-layer
    >
      {current.boards.map((board) => (
        <BoardObjectView
          key={board.id}
          board={board}
          onTitleChange={(boardId, title) => {
            if (!writable) return;
            const latest = normalizeModuleLabBoardsPageData(
              pageDataRef.current,
            );
            const next = updateBoardTitle(latest, boardId, title);
            pageDataRef.current = next;
            setPageData(next);
          }}
          onColorChange={(boardId, color) => {
            if (!writable) return;
            const latest = normalizeModuleLabBoardsPageData(
              pageDataRef.current,
            );
            const next = updateBoardColor(latest, boardId, color);
            pageDataRef.current = next;
            setPageData(next);
          }}
          onResize={(boardId, size) => {
            if (!writable) return;
            const latest = normalizeModuleLabBoardsPageData(
              pageDataRef.current,
            );
            const next = updateBoardSize(latest, boardId, size);
            pageDataRef.current = next;
            setPageData(next);
          }}
          onDelete={(boardId) => {
            if (!writable) return;
            detachLabBoardChildren(boardId);
            const latest = normalizeModuleLabBoardsPageData(
              pageDataRef.current,
            );
            const next = removeBoardInstance(latest, boardId);
            pageDataRef.current = next;
            setPageData(next);
          }}
        />
      ))}
    </div>
  );
}
