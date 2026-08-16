"use client";

/**
 * CALENDAR instances for the Module Lab — PlayHTML page data, lab-namespaced.
 */

import { usePageData, usePlayContext } from "@playhtml/react";
import { useEffect, useRef } from "react";
import { getCanvasPlacementSnapshot } from "@/components/canvas/use-canvas-camera";
import { registerModuleLabActions } from "@/lib/modules/lab-actions";
import { registerLabBoardChildSource } from "@/lib/modules/lab-board-bridge";
import { dockCreateWorldPct } from "@/lib/canvas/world-camera";
import { CalendarObjectView } from "@/modules/organise/calendar/calendar-object";
import {
  addCalendarEvent,
  addCalendarInstance,
  canCreateCalendarInstance,
  createCalendarInstance,
  EMPTY_MODULE_LAB_CALENDARS_PAGE_DATA,
  isPlayhtmlPageDataWritable,
  MODULE_LAB_CALENDARS_PAGE_DATA_NAME,
  nextCalendarSpawnPct,
  normalizeModuleLabCalendarsPageData,
  removeCalendarEvent,
  removeCalendarInstance,
  resetModuleLabCalendarsPageData,
  shiftCalendarOrigin,
  shiftCalendarView,
  updateCalendarBoardId,
  updateCalendarColor,
  updateCalendarEvent,
  updateCalendarSize,
  updateCalendarTitle,
  type ModuleLabCalendarsPageData,
} from "@/modules/organise/calendar/calendar-state";

export function CalendarLayer() {
  const [pageData, setPageData] = usePageData<ModuleLabCalendarsPageData>(
    MODULE_LAB_CALENDARS_PAGE_DATA_NAME,
    EMPTY_MODULE_LAB_CALENDARS_PAGE_DATA,
  );
  const { isLoading: playhtmlLoading, isProviderMissing } = usePlayContext();
  const current = normalizeModuleLabCalendarsPageData(pageData);
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
      kind: "calendar",
      ownedIds: (boardId) =>
        normalizeModuleLabCalendarsPageData(pageDataRef.current)
          .calendars.filter((row) => row.boardId === boardId)
          .map((row) => row.id),
      setBoardId: (instanceId, boardId) => {
        if (!writableRef.current) return;
        const latest = normalizeModuleLabCalendarsPageData(
          pageDataRef.current,
        );
        const next = updateCalendarBoardId(latest, instanceId, boardId);
        pageDataRef.current = next;
        setPageData(next);
      },
      shiftOrigin: (instanceId, deltaLeftPct, deltaTopPct) => {
        if (!writableRef.current) return;
        const latest = normalizeModuleLabCalendarsPageData(
          pageDataRef.current,
        );
        const next = shiftCalendarOrigin(
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
        if (moduleId !== "calendar") return;
        if (!writableRef.current) return;
        const latest = normalizeModuleLabCalendarsPageData(
          pageDataRef.current,
        );
        if (!canCreateCalendarInstance(latest)) return;
        const snapshot = getCanvasPlacementSnapshot();
        const base =
          snapshot != null
            ? dockCreateWorldPct(snapshot.viewport, snapshot.camera)
            : { leftPct: 56, topPct: 48 };
        const origin = nextCalendarSpawnPct(latest.calendars.length, base);
        const calendar = createCalendarInstance(origin);
        const next = addCalendarInstance(latest, calendar);
        pageDataRef.current = next;
        setPageData(next);
      },
      reset: () => {
        if (!writableRef.current) return;
        const empty = resetModuleLabCalendarsPageData();
        pageDataRef.current = empty;
        setPageData(empty);
      },
    });
  }, [setPageData]);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[2]"
      data-4663-calendar-layer
    >
      {current.calendars.map((calendar) => (
        <CalendarObjectView
          key={calendar.id}
          calendar={calendar}
          onTitleChange={(calendarId, title) => {
            if (!writable) return;
            const latest = normalizeModuleLabCalendarsPageData(
              pageDataRef.current,
            );
            const next = updateCalendarTitle(latest, calendarId, title);
            pageDataRef.current = next;
            setPageData(next);
          }}
          onColorChange={(calendarId, color) => {
            if (!writable) return;
            const latest = normalizeModuleLabCalendarsPageData(
              pageDataRef.current,
            );
            const next = updateCalendarColor(latest, calendarId, color);
            pageDataRef.current = next;
            setPageData(next);
          }}
          onViewShift={(calendarId, deltaMonths) => {
            if (!writable) return;
            const latest = normalizeModuleLabCalendarsPageData(
              pageDataRef.current,
            );
            const next = shiftCalendarView(latest, calendarId, deltaMonths);
            pageDataRef.current = next;
            setPageData(next);
          }}
          onAddEvent={(calendarId, input) => {
            if (!writable) return;
            const latest = normalizeModuleLabCalendarsPageData(
              pageDataRef.current,
            );
            const next = addCalendarEvent(latest, calendarId, input);
            pageDataRef.current = next;
            setPageData(next);
          }}
          onUpdateEvent={(calendarId, eventId, patch) => {
            if (!writable) return;
            const latest = normalizeModuleLabCalendarsPageData(
              pageDataRef.current,
            );
            const next = updateCalendarEvent(
              latest,
              calendarId,
              eventId,
              patch,
            );
            pageDataRef.current = next;
            setPageData(next);
          }}
          onDeleteEvent={(calendarId, eventId) => {
            if (!writable) return;
            const latest = normalizeModuleLabCalendarsPageData(
              pageDataRef.current,
            );
            const next = removeCalendarEvent(latest, calendarId, eventId);
            pageDataRef.current = next;
            setPageData(next);
          }}
          onResize={(calendarId, size) => {
            if (!writable) return;
            const latest = normalizeModuleLabCalendarsPageData(
              pageDataRef.current,
            );
            const next = updateCalendarSize(latest, calendarId, size);
            pageDataRef.current = next;
            setPageData(next);
          }}
          onDelete={(calendarId) => {
            if (!writable) return;
            const latest = normalizeModuleLabCalendarsPageData(
              pageDataRef.current,
            );
            const next = removeCalendarInstance(latest, calendarId);
            pageDataRef.current = next;
            setPageData(next);
          }}
        />
      ))}
    </div>
  );
}
