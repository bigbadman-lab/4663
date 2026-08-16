"use client";

/**
 * CHECKLIST instances for the Module Lab — PlayHTML page data, lab-namespaced.
 */

import { usePageData, usePlayContext } from "@playhtml/react";
import { useEffect, useRef } from "react";
import { getCanvasPlacementSnapshot } from "@/components/canvas/use-canvas-camera";
import { registerModuleLabActions } from "@/lib/modules/lab-actions";
import { dockCreateWorldPct } from "@/lib/canvas/world-camera";
import { ChecklistObjectView } from "@/modules/organise/checklist/checklist-object";
import {
  addChecklistInstance,
  addChecklistItem,
  canCreateChecklistInstance,
  createChecklistInstance,
  EMPTY_MODULE_LAB_CHECKLISTS_PAGE_DATA,
  isPlayhtmlPageDataWritable,
  MODULE_LAB_CHECKLISTS_PAGE_DATA_NAME,
  nextChecklistSpawnPct,
  normalizeModuleLabChecklistsPageData,
  removeChecklistInstance,
  removeChecklistItem,
  resetModuleLabChecklistsPageData,
  toggleChecklistItem,
  updateChecklistItemText,
  updateChecklistSize,
  updateChecklistTitle,
  updateChecklistColor,
  type ModuleLabChecklistsPageData,
} from "@/modules/organise/checklist/checklist-state";

export function ChecklistLayer() {
  const [pageData, setPageData] = usePageData<ModuleLabChecklistsPageData>(
    MODULE_LAB_CHECKLISTS_PAGE_DATA_NAME,
    EMPTY_MODULE_LAB_CHECKLISTS_PAGE_DATA,
  );
  const { isLoading: playhtmlLoading, isProviderMissing } = usePlayContext();
  const current = normalizeModuleLabChecklistsPageData(pageData);
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
        if (moduleId !== "checklist") return;
        if (!writableRef.current) return;
        const latest = normalizeModuleLabChecklistsPageData(pageDataRef.current);
        if (!canCreateChecklistInstance(latest)) return;
        const snapshot = getCanvasPlacementSnapshot();
        const base =
          snapshot != null
            ? dockCreateWorldPct(snapshot.viewport, snapshot.camera)
            : { leftPct: 52, topPct: 44 };
        const origin = nextChecklistSpawnPct(latest.checklists.length, base);
        const checklist = createChecklistInstance(origin);
        const next = addChecklistInstance(latest, checklist);
        pageDataRef.current = next;
        setPageData(next);
      },
      reset: () => {
        if (!writableRef.current) return;
        const empty = resetModuleLabChecklistsPageData();
        pageDataRef.current = empty;
        setPageData(empty);
      },
    });
  }, [setPageData]);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[2]"
      data-4663-checklist-layer
    >
      {current.checklists.map((checklist) => (
        <ChecklistObjectView
          key={checklist.id}
          checklist={checklist}
          onTitleChange={(checklistId, title) => {
            if (!writable) return;
            const latest = normalizeModuleLabChecklistsPageData(
              pageDataRef.current,
            );
            const next = updateChecklistTitle(latest, checklistId, title);
            pageDataRef.current = next;
            setPageData(next);
          }}
          onItemTextChange={(checklistId, itemId, text) => {
            if (!writable) return;
            const latest = normalizeModuleLabChecklistsPageData(
              pageDataRef.current,
            );
            const next = updateChecklistItemText(
              latest,
              checklistId,
              itemId,
              text,
            );
            pageDataRef.current = next;
            setPageData(next);
          }}
          onToggleItem={(checklistId, itemId) => {
            if (!writable) return;
            const latest = normalizeModuleLabChecklistsPageData(
              pageDataRef.current,
            );
            const next = toggleChecklistItem(latest, checklistId, itemId);
            pageDataRef.current = next;
            setPageData(next);
          }}
          onDeleteItem={(checklistId, itemId) => {
            if (!writable) return;
            const latest = normalizeModuleLabChecklistsPageData(
              pageDataRef.current,
            );
            const next = removeChecklistItem(latest, checklistId, itemId);
            pageDataRef.current = next;
            setPageData(next);
          }}
          onAddItem={(checklistId) => {
            if (!writable) return;
            const latest = normalizeModuleLabChecklistsPageData(
              pageDataRef.current,
            );
            const next = addChecklistItem(latest, checklistId);
            pageDataRef.current = next;
            setPageData(next);
          }}
          onColorChange={(checklistId, color) => {
            if (!writable) return;
            const latest = normalizeModuleLabChecklistsPageData(
              pageDataRef.current,
            );
            const next = updateChecklistColor(latest, checklistId, color);
            pageDataRef.current = next;
            setPageData(next);
          }}
          onResize={(checklistId, size) => {
            if (!writable) return;
            const latest = normalizeModuleLabChecklistsPageData(
              pageDataRef.current,
            );
            const next = updateChecklistSize(latest, checklistId, size);
            pageDataRef.current = next;
            setPageData(next);
          }}
          onDelete={(checklistId) => {
            if (!writable) return;
            const latest = normalizeModuleLabChecklistsPageData(
              pageDataRef.current,
            );
            const next = removeChecklistInstance(latest, checklistId);
            pageDataRef.current = next;
            setPageData(next);
          }}
        />
      ))}
    </div>
  );
}
