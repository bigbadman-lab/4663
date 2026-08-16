/**
 * CALENDAR V1 instance helpers and local date-only month math.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { WORLD_HEIGHT_PX, WORLD_WIDTH_PX } from "@/lib/canvas/world-camera";
import { DEFAULT_LAB_OBJECT_COLOR } from "@/lib/modules/lab-object-color";
import { EPHEMERAL_TEXTS_PAGE_DATA_NAME } from "@/lib/social/ephemeral-text";
import {
  addCalendarEvent,
  addCalendarInstance,
  applyCalendarResize,
  calendarCellSelection,
  calendarMonthCells,
  calendarMonthTitle,
  CALENDAR_DEFAULT_TITLE,
  CALENDAR_EVENT_TITLE_MAX_LENGTH,
  CALENDAR_HEIGHT_PCT_DEFAULT,
  CALENDAR_HEIGHT_PCT_MIN,
  CALENDAR_MAX_EVENTS,
  CALENDAR_MAX_INSTANCES,
  CALENDAR_MODULE_ID,
  CALENDAR_TITLE_MAX_LENGTH,
  CALENDAR_VISIBLE_EVENTS_PER_DAY,
  CALENDAR_WEEKDAY_LABELS,
  CALENDAR_WIDTH_PCT_DEFAULT,
  CALENDAR_WIDTH_PCT_MAX,
  CALENDAR_WIDTH_PCT_MIN,
  canCreateCalendarInstance,
  createCalendarInstance,
  daysInMonth,
  defaultSelectedDate,
  EMPTY_MODULE_LAB_CALENDARS_PAGE_DATA,
  eventCreateDate,
  eventsForDate,
  formatLocalDateString,
  isLeapYear,
  isSelectedDateInView,
  localCalendarToday,
  localTodayString,
  MODULE_LAB_CALENDARS_PAGE_DATA_NAME,
  nextCalendarSpawnPct,
  normalizeCalendarInstance,
  normalizeModuleLabCalendarsPageData,
  parseLocalDateString,
  playhtmlCalendarElementId,
  removeCalendarEvent,
  removeCalendarInstance,
  resetModuleLabCalendarsPageData,
  resolveCalendarDaySelection,
  shiftCalendarMonth,
  shiftCalendarOrigin,
  shiftCalendarView,
  updateCalendarBoardId,
  updateCalendarColor,
  updateCalendarEvent,
  updateCalendarSize,
  updateCalendarTitle,
  validateCalendarEventTitle,
  validateCalendarTitle,
  visibleEventsForDate,
} from "@/modules/organise/calendar/calendar-state";

const CAL_A = "550e8400-e29b-41d4-a716-446655440050";
const CAL_B = "550e8400-e29b-41d4-a716-446655440060";
const EVENT_A = "550e8400-e29b-41d4-a716-446655440051";
const EVENT_B = "550e8400-e29b-41d4-a716-446655440052";
const EVENT_C = "550e8400-e29b-41d4-a716-446655440053";
const BOARD_A = "550e8400-e29b-41d4-a716-446655440030";
const BOARD_B = "6ba7b810-9dad-11d1-80b4-00c04fd430cd";

function paddedUuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function calendarAt(
  id: string,
  now: Date = new Date("2026-08-16T12:00:00"),
) {
  return createCalendarInstance({
    leftPct: 40,
    topPct: 40,
    now,
    randomUUID: () => id,
  });
}

describe("calendar date math", () => {
  it("formats and parses date-only YYYY-MM-DD without timestamps", () => {
    assert.equal(formatLocalDateString(2026, 8, 16), "2026-08-16");
    assert.deepEqual(parseLocalDateString("2026-08-16"), {
      year: 2026,
      month: 8,
      day: 16,
    });
    assert.equal(parseLocalDateString("2026-08-16T00:00:00.000Z"), null);
    assert.equal(parseLocalDateString("2026-08-16T12:00:00"), null);
    assert.equal(parseLocalDateString("16/08/2026"), null);
    assert.equal(parseLocalDateString("2026-13-01"), null);
    assert.equal(parseLocalDateString("2026-02-30"), null);
  });

  it("uses Monday-first weekday labels", () => {
    assert.deepEqual(CALENDAR_WEEKDAY_LABELS, [
      "MON",
      "TUE",
      "WED",
      "THU",
      "FRI",
      "SAT",
      "SUN",
    ]);
  });

  it("builds a 42-cell Monday-first grid when the month starts on Monday", () => {
    const cells = calendarMonthCells(2026, 6);
    assert.equal(cells.length, 42);
    assert.equal(cells[0]?.date, "2026-06-01");
    assert.equal(cells[0]?.inCurrentMonth, true);
    assert.equal(cells[29]?.date, "2026-06-30");
    assert.equal(cells[30]?.date, "2026-07-01");
    assert.equal(cells[30]?.inCurrentMonth, false);
  });

  it("fills leading cells when the month starts on Sunday", () => {
    const cells = calendarMonthCells(2026, 2);
    assert.equal(cells[0]?.date, "2026-01-26");
    assert.equal(cells[0]?.inCurrentMonth, false);
    assert.equal(cells[6]?.date, "2026-02-01");
    assert.equal(cells[6]?.inCurrentMonth, true);
    assert.equal(new Date(2026, 1, 1).getDay(), 0);
  });

  it("handles February in a non-leap year", () => {
    assert.equal(isLeapYear(2025), false);
    assert.equal(daysInMonth(2025, 2), 28);
    const cells = calendarMonthCells(2025, 2);
    const inMonth = cells.filter((cell) => cell.inCurrentMonth);
    assert.equal(inMonth.length, 28);
    assert.equal(inMonth[27]?.date, "2025-02-28");
    assert.equal(parseLocalDateString("2025-02-29"), null);
  });

  it("handles February in a leap year", () => {
    assert.equal(isLeapYear(2024), true);
    assert.equal(daysInMonth(2024, 2), 29);
    const cells = calendarMonthCells(2024, 2);
    const inMonth = cells.filter((cell) => cell.inCurrentMonth);
    assert.equal(inMonth.length, 29);
    assert.equal(inMonth[28]?.date, "2024-02-29");
    assert.deepEqual(parseLocalDateString("2024-02-29"), {
      year: 2024,
      month: 2,
      day: 29,
    });
  });

  it("handles 30-day and 31-day months", () => {
    assert.equal(daysInMonth(2026, 4), 30);
    assert.equal(daysInMonth(2026, 8), 31);
    const april = calendarMonthCells(2026, 4).filter((cell) => cell.inCurrentMonth);
    const august = calendarMonthCells(2026, 8).filter((cell) => cell.inCurrentMonth);
    assert.equal(april.length, 30);
    assert.equal(august.length, 31);
    assert.equal(april[29]?.date, "2026-04-30");
    assert.equal(august[30]?.date, "2026-08-31");
  });

  it("marks today only when the local date is in the grid", () => {
    const today = { year: 2026, month: 8, day: 16 };
    const august = calendarMonthCells(2026, 8, today);
    const marked = august.filter((cell) => cell.isToday);
    assert.equal(marked.length, 1);
    assert.equal(marked[0]?.date, "2026-08-16");
    const july = calendarMonthCells(2026, 7, today);
    assert.equal(july.some((cell) => cell.isToday), false);
  });

  it("shifts months without touching event dates", () => {
    assert.deepEqual(shiftCalendarMonth(2026, 1, -1), { year: 2025, month: 12 });
    assert.deepEqual(shiftCalendarMonth(2026, 12, 1), { year: 2027, month: 1 });
    assert.equal(calendarMonthTitle(2026, 8), "AUGUST 2026");
  });

  it("reads today from the local Date, not UTC", () => {
    const now = new Date(2026, 7, 16, 23, 30, 0);
    assert.deepEqual(localCalendarToday(now), {
      year: 2026,
      month: 8,
      day: 16,
    });
    assert.equal(localTodayString(now), "2026-08-16");
  });
});

describe("CALENDAR selected date", () => {
  const today = { year: 2026, month: 8, day: 16 };

  it("defaults to today only when the viewed month is the current local month", () => {
    assert.equal(defaultSelectedDate(2026, 8, today), "2026-08-16");
    assert.equal(defaultSelectedDate(2026, 7, today), null);
    assert.equal(defaultSelectedDate(2026, 9, today), null);
  });

  it("selects one date at a time and replaces the previous selection", () => {
    const first = resolveCalendarDaySelection({
      date: "2026-08-16",
      viewYear: 2026,
      viewMonth: 8,
    });
    const second = resolveCalendarDaySelection({
      date: "2026-08-20",
      viewYear: 2026,
      viewMonth: 8,
    });
    assert.equal(first?.selectedDate, "2026-08-16");
    assert.equal(first?.viewDeltaMonths, 0);
    assert.equal(second?.selectedDate, "2026-08-20");
    assert.equal(second?.viewDeltaMonths, 0);
    assert.notEqual(first?.selectedDate, second?.selectedDate);
  });

  it("keeps TODAY and SELECTED as separate cell states that can coexist", () => {
    const both = calendarCellSelection({
      cellDate: "2026-08-16",
      inCurrentMonth: true,
      isToday: true,
      selectedDate: "2026-08-16",
      viewYear: 2026,
      viewMonth: 8,
    });
    assert.deepEqual(both, { isToday: true, isSelected: true });
    const todayOnly = calendarCellSelection({
      cellDate: "2026-08-16",
      inCurrentMonth: true,
      isToday: true,
      selectedDate: "2026-08-20",
      viewYear: 2026,
      viewMonth: 8,
    });
    assert.deepEqual(todayOnly, { isToday: true, isSelected: false });
    const selectedOnly = calendarCellSelection({
      cellDate: "2026-08-20",
      inCurrentMonth: true,
      isToday: false,
      selectedDate: "2026-08-20",
      viewYear: 2026,
      viewMonth: 8,
    });
    assert.deepEqual(selectedOnly, { isToday: false, isSelected: true });
  });

  it("selects a filler day's exact date and requests navigation to that month", () => {
    const julyFiller = resolveCalendarDaySelection({
      date: "2026-07-31",
      viewYear: 2026,
      viewMonth: 8,
    });
    assert.equal(julyFiller?.selectedDate, "2026-07-31");
    assert.equal(julyFiller?.viewDeltaMonths, -1);
    const septemberFiller = resolveCalendarDaySelection({
      date: "2026-09-01",
      viewYear: 2026,
      viewMonth: 8,
    });
    assert.equal(septemberFiller?.selectedDate, "2026-09-01");
    assert.equal(septemberFiller?.viewDeltaMonths, 1);
  });

  it("hides selection when the viewed month no longer owns the selected date", () => {
    assert.equal(isSelectedDateInView("2026-08-16", 2026, 8), true);
    assert.equal(isSelectedDateInView("2026-08-16", 2026, 9), false);
    const hidden = calendarCellSelection({
      cellDate: "2026-08-16",
      inCurrentMonth: false,
      isToday: true,
      selectedDate: "2026-08-16",
      viewYear: 2026,
      viewMonth: 9,
    });
    assert.equal(hidden.isSelected, false);
    assert.equal(hidden.isToday, true);
  });

  it("does not rewrite the selected date when only the month view changes", () => {
    let data = { calendars: [calendarAt(CAL_A, new Date(2026, 7, 16))] };
    data = addCalendarEvent(data, CAL_A, {
      date: "2026-08-16",
      title: "Launch",
      randomUUID: () => EVENT_A,
    });
    const selected = "2026-08-16";
    data = shiftCalendarView(data, CAL_A, 1);
    assert.equal(data.calendars[0]?.viewMonth, 9);
    assert.equal(data.calendars[0]?.events[0]?.date, "2026-08-16");
    assert.equal(isSelectedDateInView(selected, 2026, 9), false);
    assert.equal(isSelectedDateInView(selected, 2026, 8), true);
    assert.equal("selectedDate" in data.calendars[0]!, false);
  });

  it("uses the selected date for + EVENT, falling back to today", () => {
    assert.equal(eventCreateDate("2026-08-20", "2026-08-16"), "2026-08-20");
    assert.equal(eventCreateDate(null, "2026-08-16"), "2026-08-16");
    assert.equal(eventCreateDate("nope", "2026-08-16"), "2026-08-16");
  });

  it("event-date selection does not create another event", () => {
    let data = { calendars: [calendarAt(CAL_A, new Date(2026, 7, 16))] };
    data = addCalendarEvent(data, CAL_A, {
      date: "2026-08-16",
      title: "Launch",
      randomUUID: () => EVENT_A,
    });
    const before = data.calendars[0]!.events.length;
    const clicked = resolveCalendarDaySelection({
      date: data.calendars[0]!.events[0]!.date,
      viewYear: 2026,
      viewMonth: 8,
    });
    assert.equal(clicked?.selectedDate, "2026-08-16");
    assert.equal(data.calendars[0]?.events.length, before);
    assert.equal(data.calendars[0]?.events[0]?.id, EVENT_A);
  });

  it("gives independent default selection per calendar view", () => {
    const august = defaultSelectedDate(2026, 8, today);
    const july = defaultSelectedDate(2026, 7, today);
    assert.equal(august, "2026-08-16");
    assert.equal(july, null);
    assert.notEqual(august, july);
  });
});

describe("CALENDAR instance helpers", () => {
  it("creates unique ids with default CALENDAR title, current local month, and no events", () => {
    const now = new Date(2026, 7, 16, 9, 0, 0);
    const a = createCalendarInstance({
      leftPct: 40,
      topPct: 40,
      now,
      randomUUID: () => CAL_A,
    });
    const b = createCalendarInstance({
      leftPct: 42,
      topPct: 42,
      now,
      randomUUID: () => CAL_B,
    });
    assert.equal(a.id, CAL_A);
    assert.equal(b.id, CAL_B);
    assert.notEqual(a.id, b.id);
    assert.equal(a.moduleId, CALENDAR_MODULE_ID);
    assert.equal(a.title, CALENDAR_DEFAULT_TITLE);
    assert.equal(a.color, DEFAULT_LAB_OBJECT_COLOR);
    assert.equal(a.viewYear, 2026);
    assert.equal(a.viewMonth, 8);
    assert.deepEqual(a.events, []);
    assert.equal(a.boardId, null);
    assert.equal(playhtmlCalendarElementId(a.id), `4663-lab-calendar-${CAL_A}`);
  });

  it("clamps title length and treats empty/legacy titles as CALENDAR", () => {
    assert.equal(validateCalendarTitle(""), CALENDAR_DEFAULT_TITLE);
    assert.equal(validateCalendarTitle("   "), CALENDAR_DEFAULT_TITLE);
    assert.equal(validateCalendarTitle(null), CALENDAR_DEFAULT_TITLE);
    assert.equal(validateCalendarTitle("SCHOOL"), "SCHOOL");
    assert.equal(
      validateCalendarTitle("x".repeat(CALENDAR_TITLE_MAX_LENGTH + 4)).length,
      CALENDAR_TITLE_MAX_LENGTH,
    );
    assert.equal(
      validateCalendarEventTitle("y".repeat(CALENDAR_EVENT_TITLE_MAX_LENGTH + 3))
        .length,
      CALENDAR_EVENT_TITLE_MAX_LENGTH,
    );
  });

  it("normalizes valid calendars and drops malformed / duplicate ids", () => {
    const now = new Date(2026, 7, 16);
    const valid = calendarAt(CAL_A, now);
    const data = normalizeModuleLabCalendarsPageData(
      {
        calendars: [
          valid,
          { ...valid, id: CAL_A },
          { id: "nope", moduleId: "calendar", leftPct: 10, topPct: 10 },
          {
            id: CAL_B,
            moduleId: "calendar",
            leftPct: 12,
            topPct: 14,
            title: "LAUNCHES",
            color: "dark",
            viewYear: 2027,
            viewMonth: 1,
            events: [
              { id: EVENT_A, date: "2027-01-04", title: "Kickoff" },
              { id: EVENT_A, date: "2027-01-05", title: "dup" },
              { id: EVENT_B, date: "2027-01-04T00:00:00.000Z", title: "utc" },
              { id: EVENT_C, date: "2027-01-08", title: "  Ship  " },
            ],
          },
        ],
      },
      now,
    );
    assert.equal(data.calendars.length, 2);
    assert.equal(data.calendars[0]?.id, CAL_A);
    assert.equal(data.calendars[1]?.id, CAL_B);
    assert.equal(data.calendars[1]?.title, "LAUNCHES");
    assert.equal(data.calendars[1]?.viewYear, 2027);
    assert.equal(data.calendars[1]?.viewMonth, 1);
    assert.equal(data.calendars[1]?.events.length, 2);
    assert.equal(data.calendars[1]?.events[0]?.id, EVENT_A);
    assert.equal(data.calendars[1]?.events[0]?.date, "2027-01-04");
    assert.equal(data.calendars[1]?.events[0]?.title, "Kickoff");
    assert.equal(data.calendars[1]?.events[1]?.id, EVENT_C);
    assert.equal(data.calendars[1]?.events[1]?.title, "Ship");
    assert.equal(
      data.calendars[1]?.events.some((event) => event.date.includes("T")),
      false,
    );
  });

  it("falls back to the current local month for invalid viewYear/viewMonth", () => {
    const now = new Date(2026, 7, 16);
    const raw = {
      id: CAL_A,
      moduleId: "calendar",
      leftPct: 10,
      topPct: 10,
      viewYear: "August",
      viewMonth: 99,
    };
    const normalized = normalizeCalendarInstance(raw, now);
    assert.equal(normalized?.viewYear, 2026);
    assert.equal(normalized?.viewMonth, 8);
  });

  it("updates one calendar without mutating another", () => {
    const now = new Date(2026, 7, 16);
    let data = {
      calendars: [calendarAt(CAL_A, now), calendarAt(CAL_B, now)],
    };
    data = updateCalendarTitle(data, CAL_A, "SCHOOL");
    data = updateCalendarColor(data, CAL_A, "dark");
    data = shiftCalendarView(data, CAL_A, 1);
    assert.equal(data.calendars[0]?.title, "SCHOOL");
    assert.equal(data.calendars[0]?.color, "dark");
    assert.equal(data.calendars[0]?.viewYear, 2026);
    assert.equal(data.calendars[0]?.viewMonth, 9);
    assert.equal(data.calendars[1]?.title, CALENDAR_DEFAULT_TITLE);
    assert.equal(data.calendars[1]?.color, DEFAULT_LAB_OBJECT_COLOR);
    assert.equal(data.calendars[1]?.viewYear, 2026);
    assert.equal(data.calendars[1]?.viewMonth, 8);
  });

  it("month navigation does not alter event dates", () => {
    const now = new Date(2026, 7, 16);
    let data = { calendars: [calendarAt(CAL_A, now)] };
    data = addCalendarEvent(data, CAL_A, {
      date: "2026-08-16",
      title: "Launch",
      randomUUID: () => EVENT_A,
    });
    data = shiftCalendarView(data, CAL_A, -1);
    assert.equal(data.calendars[0]?.viewMonth, 7);
    assert.equal(data.calendars[0]?.events[0]?.date, "2026-08-16");
    assert.equal(data.calendars[0]?.events[0]?.id, EVENT_A);
  });

  it("adds, edits, moves, and deletes events with stable ids", () => {
    const now = new Date(2026, 7, 16);
    let data = { calendars: [calendarAt(CAL_A, now)] };
    data = addCalendarEvent(data, CAL_A, {
      date: "2026-08-16",
      title: "Launch",
      randomUUID: () => EVENT_A,
    });
    data = addCalendarEvent(data, CAL_A, {
      date: "2026-08-16",
      title: "Rehearsal",
      randomUUID: () => EVENT_B,
    });
    assert.equal(data.calendars[0]?.events.length, 2);
    assert.deepEqual(
      eventsForDate(data.calendars[0]!.events, "2026-08-16").map((row) => row.id),
      [EVENT_A, EVENT_B],
    );
    const overflow = visibleEventsForDate(
      [
        ...data.calendars[0]!.events,
        { id: EVENT_C, date: "2026-08-16", title: "Extra" },
      ],
      "2026-08-16",
    );
    assert.equal(overflow.visible.length, CALENDAR_VISIBLE_EVENTS_PER_DAY);
    assert.equal(overflow.overflow, 1);

    data = updateCalendarEvent(data, CAL_A, EVENT_A, { title: "Go live" });
    assert.equal(data.calendars[0]?.events[0]?.id, EVENT_A);
    assert.equal(data.calendars[0]?.events[0]?.title, "Go live");
    data = updateCalendarEvent(data, CAL_A, EVENT_A, { date: "2026-08-18" });
    assert.equal(data.calendars[0]?.events[0]?.id, EVENT_A);
    assert.equal(data.calendars[0]?.events[0]?.date, "2026-08-18");
    data = removeCalendarEvent(data, CAL_A, EVENT_B);
    assert.deepEqual(
      data.calendars[0]?.events.map((event) => event.id),
      [EVENT_A],
    );
  });

  it("does not persist a transient editor or selected-date field on calendar state", () => {
    const created = calendarAt(CAL_A);
    assert.equal("editor" in created, false);
    assert.equal("draft" in created, false);
    assert.equal("selectedDate" in created, false);
    const source = readCalendarStateSource();
    assert.equal(source.includes("editorOpen"), false);
    const instanceType = source.match(
      /export type CalendarInstance = \{[^}]+\}/,
    );
    assert.ok(instanceType);
    assert.equal(instanceType[0].includes("selectedDate"), false);
    const normalized = normalizeCalendarInstance({
      ...created,
      selectedDate: "2026-08-16",
    });
    assert.equal(normalized != null && "selectedDate" in normalized, false);
  });

  it("caps instances and events and removes by id", () => {
    let data = EMPTY_MODULE_LAB_CALENDARS_PAGE_DATA;
    for (let i = 0; i < CALENDAR_MAX_INSTANCES + 2; i += 1) {
      const calendar = createCalendarInstance({
        leftPct: 20,
        topPct: 20,
        now: new Date(2026, 7, 16),
        randomUUID: () => paddedUuid(i + 1),
      });
      data = addCalendarInstance(data, calendar);
    }
    assert.equal(data.calendars.length, CALENDAR_MAX_INSTANCES);
    assert.equal(canCreateCalendarInstance(data), false);
    data = removeCalendarInstance(data, paddedUuid(1));
    assert.equal(data.calendars.length, CALENDAR_MAX_INSTANCES - 1);

    let events = { calendars: [calendarAt(CAL_A)] };
    for (let i = 0; i < CALENDAR_MAX_EVENTS + 3; i += 1) {
      events = addCalendarEvent(events, CAL_A, {
        date: "2026-08-16",
        title: `E${i}`,
        randomUUID: () => paddedUuid(100 + i),
      });
    }
    assert.equal(events.calendars[0]?.events.length, CALENDAR_MAX_EVENTS);
  });

  it("legacy calendars without colour, size, or events normalize safely", () => {
    const now = new Date(2026, 7, 16);
    const legacy = normalizeCalendarInstance(
      {
        id: CAL_A,
        moduleId: "calendar",
        leftPct: 18,
        topPct: 22,
      },
      now,
    );
    assert.equal(legacy?.color, DEFAULT_LAB_OBJECT_COLOR);
    assert.equal(legacy?.widthPct, CALENDAR_WIDTH_PCT_DEFAULT);
    assert.equal(legacy?.heightPct, CALENDAR_HEIGHT_PCT_DEFAULT);
    assert.equal(legacy?.title, CALENDAR_DEFAULT_TITLE);
    assert.equal(legacy?.viewYear, 2026);
    assert.equal(legacy?.viewMonth, 8);
    assert.deepEqual(legacy?.events, []);
    assert.equal(legacy?.boardId, null);
  });

  it("clamps resize and keeps sibling geometry/events intact", () => {
    const now = new Date(2026, 7, 16);
    let data = {
      calendars: [calendarAt(CAL_A, now), calendarAt(CAL_B, now)],
    };
    data = addCalendarEvent(data, CAL_B, {
      date: "2026-08-20",
      title: "Keep",
      randomUUID: () => EVENT_A,
    });
    const sibling = data.calendars[1]!;
    data = updateCalendarSize(data, CAL_A, {
      widthPct: CALENDAR_WIDTH_PCT_MAX + 10,
      heightPct: CALENDAR_HEIGHT_PCT_MIN / 2,
    });
    assert.ok((data.calendars[0]?.widthPct ?? 0) <= CALENDAR_WIDTH_PCT_MAX);
    assert.ok((data.calendars[0]?.heightPct ?? 0) >= CALENDAR_HEIGHT_PCT_MIN);
    assert.equal(data.calendars[1]?.widthPct, sibling.widthPct);
    assert.equal(data.calendars[1]?.events[0]?.title, "Keep");
    const grown = applyCalendarResize({
      widthPct: CALENDAR_WIDTH_PCT_DEFAULT,
      heightPct: CALENDAR_HEIGHT_PCT_DEFAULT,
      originLeftPct: 10,
      originTopPct: 10,
      deltaWidthPct: 1,
      deltaHeightPct: 1,
    });
    assert.ok(grown.widthPct > CALENDAR_WIDTH_PCT_DEFAULT);
    assert.ok(grown.heightPct > CALENDAR_HEIGHT_PCT_DEFAULT);
    assert.ok(CALENDAR_WIDTH_PCT_MIN < CALENDAR_WIDTH_PCT_DEFAULT);
    assert.ok(CALENDAR_HEIGHT_PCT_MIN < CALENDAR_HEIGHT_PCT_DEFAULT);
  });

  it("offsets spawn so later calendars do not share the same origin", () => {
    const first = nextCalendarSpawnPct(0, { leftPct: 40, topPct: 40 });
    const second = nextCalendarSpawnPct(1, { leftPct: 40, topPct: 40 });
    assert.notDeepEqual(first, second);
  });

  it("RESET returns empty lab calendars without touching other page-data names", () => {
    assert.equal(
      MODULE_LAB_CALENDARS_PAGE_DATA_NAME,
      "4663-module-lab-calendars",
    );
    assert.notEqual(
      MODULE_LAB_CALENDARS_PAGE_DATA_NAME,
      EPHEMERAL_TEXTS_PAGE_DATA_NAME,
    );
    const reset = resetModuleLabCalendarsPageData();
    assert.deepEqual(reset, EMPTY_MODULE_LAB_CALENDARS_PAGE_DATA);
    assert.equal(
      WORLD_WIDTH_PX > 0 && WORLD_HEIGHT_PX > 0,
      true,
    );
  });

  it("BOARD ownership uses the same optional boardId seam", () => {
    const calendar = calendarAt(CAL_A);
    assert.equal(calendar.boardId, null);
    let data = { calendars: [calendar] };
    data = updateCalendarBoardId(data, CAL_A, BOARD_A);
    assert.equal(data.calendars[0]?.boardId, BOARD_A);
    data = updateCalendarBoardId(data, CAL_A, BOARD_B);
    assert.equal(data.calendars[0]?.boardId, BOARD_B);
    const left = data.calendars[0]!.leftPct;
    const top = data.calendars[0]!.topPct;
    data = updateCalendarBoardId(data, CAL_A, null);
    assert.equal(data.calendars[0]?.boardId, null);
    assert.equal(data.calendars[0]?.leftPct, left);
    assert.equal(data.calendars[0]?.topPct, top);
    data = updateCalendarBoardId(data, CAL_A, BOARD_A);
    data = shiftCalendarOrigin(data, CAL_A, 1.5, -0.5);
    assert.equal(data.calendars[0]?.leftPct, left + 1.5);
    assert.equal(data.calendars[0]?.topPct, top - 0.5);
    assert.equal(data.calendars[0]?.boardId, BOARD_A);
  });
});

function readCalendarStateSource(): string {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../..",
  );
  return readFileSync(
    path.join(root, "src/modules/organise/calendar/calendar-state.ts"),
    "utf8",
  );
}
