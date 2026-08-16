"use client";

/**
 * NOTE instances for the Module Lab — PlayHTML page data, lab-namespaced.
 */

import { usePageData, usePlayContext } from "@playhtml/react";
import { useEffect, useRef } from "react";
import { getCanvasPlacementSnapshot } from "@/components/canvas/use-canvas-camera";
import { registerModuleLabActions } from "@/lib/modules/lab-actions";
import { dockCreateWorldPct } from "@/lib/canvas/world-camera";
import { NoteObjectView } from "@/modules/create/note/note-object";
import {
  addNoteInstance,
  canCreateNoteInstance,
  createNoteInstance,
  EMPTY_MODULE_LAB_NOTES_PAGE_DATA,
  isPlayhtmlPageDataWritable,
  MODULE_LAB_NOTES_PAGE_DATA_NAME,
  nextNoteSpawnPct,
  normalizeModuleLabNotesPageData,
  removeNoteInstance,
  resetModuleLabNotesPageData,
  updateNoteContent,
  updateNoteSize,
  type ModuleLabNotesPageData,
} from "@/modules/create/note/note-state";

export function NoteLayer() {
  const [pageData, setPageData] = usePageData<ModuleLabNotesPageData>(
    MODULE_LAB_NOTES_PAGE_DATA_NAME,
    EMPTY_MODULE_LAB_NOTES_PAGE_DATA,
  );
  const { isLoading: playhtmlLoading, isProviderMissing } = usePlayContext();
  const current = normalizeModuleLabNotesPageData(pageData);
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
      createNote: () => {
        if (!writableRef.current) return;
        const latest = normalizeModuleLabNotesPageData(pageDataRef.current);
        if (!canCreateNoteInstance(latest)) return;
        const snapshot = getCanvasPlacementSnapshot();
        const base =
          snapshot != null
            ? dockCreateWorldPct(snapshot.viewport, snapshot.camera)
            : { leftPct: 50, topPct: 42 };
        const origin = nextNoteSpawnPct(latest.notes.length, base);
        const note = createNoteInstance(origin);
        const next = addNoteInstance(latest, note);
        pageDataRef.current = next;
        setPageData(next);
      },
      reset: () => {
        if (!writableRef.current) return;
        const empty = resetModuleLabNotesPageData();
        pageDataRef.current = empty;
        setPageData(empty);
      },
    });
  }, [setPageData]);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[2]"
      data-4663-note-layer
    >
      {current.notes.map((note) => (
        <NoteObjectView
          key={note.id}
          note={note}
          onContentChange={(noteId, content) => {
            if (!writable) return;
            const latest = normalizeModuleLabNotesPageData(pageDataRef.current);
            const next = updateNoteContent(latest, noteId, content);
            pageDataRef.current = next;
            setPageData(next);
          }}
          onDelete={(noteId) => {
            if (!writable) return;
            const latest = normalizeModuleLabNotesPageData(pageDataRef.current);
            const next = removeNoteInstance(latest, noteId);
            pageDataRef.current = next;
            setPageData(next);
          }}
          onResize={(noteId, size) => {
            if (!writable) return;
            const latest = normalizeModuleLabNotesPageData(pageDataRef.current);
            const next = updateNoteSize(latest, noteId, size);
            pageDataRef.current = next;
            setPageData(next);
          }}
        />
      ))}
    </div>
  );
}
