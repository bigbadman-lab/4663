/**
 * CALENDAR V1 — Module Lab month calendar.
 * Event dates are local-calendar YYYY-MM-DD strings, never UTC timestamps.
 * PlayHTML page-data only. Not a scheduling platform.
 */

import { WORLD_HEIGHT_PX, WORLD_WIDTH_PX, type WorldPct } from "@/lib/canvas/world-camera";
import { normalizeLabBoardId } from "@/lib/modules/lab-board-containment";
import {
  DEFAULT_LAB_OBJECT_COLOR,
  normalizeLabObjectColor,
  type LabObjectColor,
} from "@/lib/modules/lab-object-color";
import {
  applyLabObjectResize,
  clampLabObjectSize,
  frameFromCenterPct,
  LAB_SPAWN_OFFSET_PCT,
  nextLabSpawnPct,
  worldDeltaToLabSizePct,
  type LabObjectSize,
  type LabObjectSizeLimits,
} from "@/lib/modules/lab-object-size";
import { isUuid, normalizeSessionId } from "@/lib/presence/session-id";

export const CALENDAR_MODULE_ID = "calendar" as const;

export const MODULE_LAB_CALENDARS_PAGE_DATA_NAME =
  "4663-module-lab-calendars" as const;

export const CALENDAR_MAX_INSTANCES = 40 as const;
export const CALENDAR_TITLE_MAX_LENGTH = 80 as const;
export const CALENDAR_EVENT_TITLE_MAX_LENGTH = 48 as const;
export const CALENDAR_MAX_EVENTS = 80 as const;
export const CALENDAR_DEFAULT_TITLE = "CALENDAR" as const;
export const CALENDAR_VISIBLE_EVENTS_PER_DAY = 2 as const;
export const CALENDAR_SPAWN_OFFSET_PCT = LAB_SPAWN_OFFSET_PCT;

export const CALENDAR_WIDTH_PCT_DEFAULT = (480 / WORLD_WIDTH_PX) * 100;
export const CALENDAR_HEIGHT_PCT_DEFAULT = (400 / WORLD_HEIGHT_PX) * 100;
export const CALENDAR_WIDTH_PCT_MIN = (320 / WORLD_WIDTH_PX) * 100;
export const CALENDAR_HEIGHT_PCT_MIN = (280 / WORLD_HEIGHT_PX) * 100;
export const CALENDAR_WIDTH_PCT_MAX = (960 / WORLD_WIDTH_PX) * 100;
export const CALENDAR_HEIGHT_PCT_MAX = (900 / WORLD_HEIGHT_PX) * 100;

export const CALENDAR_SIZE_LIMITS: LabObjectSizeLimits = {
  widthPctMin: CALENDAR_WIDTH_PCT_MIN,
  heightPctMin: CALENDAR_HEIGHT_PCT_MIN,
  widthPctMax: CALENDAR_WIDTH_PCT_MAX,
  heightPctMax: CALENDAR_HEIGHT_PCT_MAX,
  widthPctDefault: CALENDAR_WIDTH_PCT_DEFAULT,
  heightPctDefault: CALENDAR_HEIGHT_PCT_DEFAULT,
};

export const CALENDAR_WEEKDAY_LABELS = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
] as const;

export const CALENDAR_MONTH_LABELS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
] as const;

export type LocalCalendarDate = {
  year: number;
  month: number;
  day: number;
};

export type CalendarMonthCell = {
  year: number;
  month: number;
  day: number;
  date: string;
  inCurrentMonth: boolean;
  isToday: boolean;
};

export type CalendarEvent = {
  id: string;
  date: string;
  title: string;
};

export type CalendarInstance = {
  id: string;
  moduleId: typeof CALENDAR_MODULE_ID;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  title: string;
  color: LabObjectColor;
  viewYear: number;
  viewMonth: number;
  events: CalendarEvent[];
  boardId: string | null;
};

export type ModuleLabCalendarsPageData = {
  calendars: CalendarInstance[];
};

export const EMPTY_MODULE_LAB_CALENDARS_PAGE_DATA: ModuleLabCalendarsPageData =
  { calendars: [] };

export function playhtmlCalendarElementId(calendarId: string): string {
  return `4663-lab-calendar-${calendarId}`;
}

export function isPlayhtmlPageDataWritable(input: {
  isLoading: boolean;
  isProviderMissing: boolean;
}): boolean {
  return !input.isLoading && !input.isProviderMissing;
}

function isFinitePct(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function formatLocalDateString(
  year: number,
  month: number,
  day: number,
): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function isLeapYear(year: number): boolean {
  if (!Number.isInteger(year)) return false;
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month)) return 0;
  if (month < 1 || month > 12) return 0;
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

export function isValidLocalDate(
  year: number,
  month: number,
  day: number,
): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

/**
 * Parse a date-only YYYY-MM-DD string as a local calendar date.
 * Rejects ISO timestamps (`T`, `Z`) so timezone conversion cannot shift the day.
 */
export function parseLocalDateString(raw: unknown): LocalCalendarDate | null {
  if (typeof raw !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidLocalDate(year, month, day)) return null;
  return { year, month, day };
}

export function localCalendarToday(now: Date = new Date()): LocalCalendarDate {
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

export function localTodayString(now: Date = new Date()): string {
  const today = localCalendarToday(now);
  return formatLocalDateString(today.year, today.month, today.day);
}

export function calendarMonthTitle(year: number, month: number): string {
  const label = CALENDAR_MONTH_LABELS[month - 1];
  if (label == null) return `${year}`;
  return `${label} ${year}`;
}

/**
 * Monday-first 6×7 grid (42 cells). Adjacent-month fillers keep the height stable.
 * Uses local Date(year, month-1, day) weekday — not UTC.
 */
export function calendarMonthCells(
  year: number,
  month: number,
  today: LocalCalendarDate | null = null,
): CalendarMonthCell[] {
  if (!isValidLocalDate(year, month, 1)) return [];
  const first = new Date(year, month - 1, 1);
  const mondayIndex = (first.getDay() + 6) % 7;
  const startDay = 1 - mondayIndex;
  const todayKey =
    today != null && isValidLocalDate(today.year, today.month, today.day)
      ? formatLocalDateString(today.year, today.month, today.day)
      : null;
  const cells: CalendarMonthCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const cursor = new Date(year, month - 1, startDay + i);
    const cellYear = cursor.getFullYear();
    const cellMonth = cursor.getMonth() + 1;
    const cellDay = cursor.getDate();
    const date = formatLocalDateString(cellYear, cellMonth, cellDay);
    cells.push({
      year: cellYear,
      month: cellMonth,
      day: cellDay,
      date,
      inCurrentMonth: cellYear === year && cellMonth === month,
      isToday: todayKey != null && date === todayKey,
    });
  }
  return cells;
}

export function shiftCalendarMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const d = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  const total = year * 12 + (month - 1) + d;
  const nextYear = Math.floor(total / 12);
  const nextMonth = total - nextYear * 12 + 1;
  return { year: nextYear, month: nextMonth };
}

/**
 * UI-only selected date. Not persisted. Today is selected on mount when the
 * viewed month is the current local month; otherwise none.
 */
export function defaultSelectedDate(
  viewYear: number,
  viewMonth: number,
  today: LocalCalendarDate,
): string | null {
  if (!isValidLocalDate(today.year, today.month, today.day)) return null;
  if (today.year !== viewYear || today.month !== viewMonth) return null;
  return formatLocalDateString(today.year, today.month, today.day);
}

export function isSelectedDateInView(
  selectedDate: string | null,
  viewYear: number,
  viewMonth: number,
): boolean {
  const parsed = parseLocalDateString(selectedDate);
  if (parsed == null) return false;
  return parsed.year === viewYear && parsed.month === viewMonth;
}

export function eventCreateDate(
  selectedDate: string | null,
  todayDate: string,
): string {
  return parseLocalDateString(selectedDate) != null
    ? (selectedDate as string)
    : todayDate;
}

export type CalendarDaySelection = {
  selectedDate: string;
  viewDeltaMonths: number;
};

/** Select an exact YYYY-MM-DD. Filler days also request a view-month jump. */
export function resolveCalendarDaySelection(input: {
  date: string;
  viewYear: number;
  viewMonth: number;
}): CalendarDaySelection | null {
  const parsed = parseLocalDateString(input.date);
  if (parsed == null) return null;
  return {
    selectedDate: formatLocalDateString(parsed.year, parsed.month, parsed.day),
    viewDeltaMonths:
      parsed.year * 12 +
      parsed.month -
      (input.viewYear * 12 + input.viewMonth),
  };
}

export function calendarCellSelection(input: {
  cellDate: string;
  inCurrentMonth: boolean;
  isToday: boolean;
  selectedDate: string | null;
  viewYear: number;
  viewMonth: number;
}): { isToday: boolean; isSelected: boolean } {
  const selectedInView = isSelectedDateInView(
    input.selectedDate,
    input.viewYear,
    input.viewMonth,
  );
  return {
    isToday: input.isToday,
    isSelected:
      selectedInView &&
      input.inCurrentMonth &&
      input.selectedDate === input.cellDate,
  };
}

export function eventsForDate(
  events: readonly CalendarEvent[],
  date: string,
): CalendarEvent[] {
  return events.filter((event) => event.date === date);
}

export function visibleEventsForDate(
  events: readonly CalendarEvent[],
  date: string,
): { visible: CalendarEvent[]; overflow: number } {
  const all = eventsForDate(events, date);
  if (all.length <= CALENDAR_VISIBLE_EVENTS_PER_DAY) {
    return { visible: all, overflow: 0 };
  }
  return {
    visible: all.slice(0, CALENDAR_VISIBLE_EVENTS_PER_DAY),
    overflow: all.length - CALENDAR_VISIBLE_EVENTS_PER_DAY,
  };
}

export function validateCalendarTitle(raw: unknown): string {
  if (typeof raw !== "string") return CALENDAR_DEFAULT_TITLE;
  const next =
    raw.length <= CALENDAR_TITLE_MAX_LENGTH
      ? raw
      : raw.slice(0, CALENDAR_TITLE_MAX_LENGTH);
  return next.trim() === "" ? CALENDAR_DEFAULT_TITLE : next;
}

export function validateCalendarEventTitle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.length <= CALENDAR_EVENT_TITLE_MAX_LENGTH
    ? raw
    : raw.slice(0, CALENDAR_EVENT_TITLE_MAX_LENGTH);
}

const VIEW_YEAR_MIN = 1970;
const VIEW_YEAR_MAX = 2100;

export function normalizeCalendarView(
  year: unknown,
  month: unknown,
  now: Date = new Date(),
): { viewYear: number; viewMonth: number } {
  const today = localCalendarToday(now);
  if (
    typeof year !== "number" ||
    !Number.isInteger(year) ||
    year < VIEW_YEAR_MIN ||
    year > VIEW_YEAR_MAX
  ) {
    return { viewYear: today.year, viewMonth: today.month };
  }
  if (
    typeof month !== "number" ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return { viewYear: today.year, viewMonth: today.month };
  }
  return { viewYear: year, viewMonth: month };
}

function normalizeCalendarEvent(raw: unknown): CalendarEvent | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isUuid(record.id)) return null;
  const parsed = parseLocalDateString(record.date);
  if (parsed == null) return null;
  const title = validateCalendarEventTitle(record.title).trim();
  if (title === "") return null;
  return {
    id: normalizeSessionId(record.id),
    date: formatLocalDateString(parsed.year, parsed.month, parsed.day),
    title,
  };
}

function defaultCalendarSizeForOrigin(
  leftPct: number,
  topPct: number,
): LabObjectSize {
  return clampLabObjectSize({
    widthPct: CALENDAR_WIDTH_PCT_DEFAULT,
    heightPct: CALENDAR_HEIGHT_PCT_DEFAULT,
    originLeftPct: leftPct,
    originTopPct: topPct,
    limits: CALENDAR_SIZE_LIMITS,
  });
}

export function normalizeCalendarInstance(
  raw: unknown,
  now: Date = new Date(),
): CalendarInstance | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isUuid(record.id)) return null;
  if (record.moduleId !== CALENDAR_MODULE_ID) return null;
  if (!isFinitePct(record.leftPct) || !isFinitePct(record.topPct)) return null;
  if (record.leftPct < -5 || record.leftPct > 105) return null;
  if (record.topPct < -5 || record.topPct > 105) return null;

  const leftPct = record.leftPct;
  const topPct = record.topPct;
  const widthRaw = isFinitePct(record.widthPct) ? record.widthPct : null;
  const heightRaw = isFinitePct(record.heightPct) ? record.heightPct : null;
  const size =
    widthRaw != null || heightRaw != null
      ? clampLabObjectSize({
          widthPct: widthRaw ?? CALENDAR_WIDTH_PCT_DEFAULT,
          heightPct: heightRaw ?? CALENDAR_HEIGHT_PCT_DEFAULT,
          originLeftPct: leftPct,
          originTopPct: topPct,
          limits: CALENDAR_SIZE_LIMITS,
        })
      : defaultCalendarSizeForOrigin(leftPct, topPct);

  const view = normalizeCalendarView(record.viewYear, record.viewMonth, now);
  const seen = new Set<string>();
  const events: CalendarEvent[] = [];
  if (Array.isArray(record.events)) {
    for (const item of record.events) {
      const event = normalizeCalendarEvent(item);
      if (!event) continue;
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      events.push(event);
      if (events.length >= CALENDAR_MAX_EVENTS) break;
    }
  }

  return {
    id: normalizeSessionId(record.id),
    moduleId: CALENDAR_MODULE_ID,
    leftPct,
    topPct,
    widthPct: size.widthPct,
    heightPct: size.heightPct,
    title: validateCalendarTitle(record.title),
    color: normalizeLabObjectColor(record.color),
    viewYear: view.viewYear,
    viewMonth: view.viewMonth,
    events,
    boardId: normalizeLabBoardId(record.boardId),
  };
}

export function normalizeModuleLabCalendarsPageData(
  raw: unknown,
  now: Date = new Date(),
): ModuleLabCalendarsPageData {
  if (raw === null || typeof raw !== "object") {
    return { calendars: [] };
  }
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.calendars)) {
    return { calendars: [] };
  }
  const seen = new Set<string>();
  const calendars: CalendarInstance[] = [];
  for (const item of record.calendars) {
    const normalized = normalizeCalendarInstance(item, now);
    if (!normalized) continue;
    if (seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    calendars.push(normalized);
    if (calendars.length >= CALENDAR_MAX_INSTANCES) break;
  }
  return { calendars };
}

export type CreateCalendarInstanceInput = {
  leftPct: number;
  topPct: number;
  title?: string;
  now?: Date;
  randomUUID?: () => string;
};

export function createCalendarInstance(
  input: CreateCalendarInstanceInput,
): CalendarInstance {
  const randomUUID = input.randomUUID ?? (() => crypto.randomUUID());
  const now = input.now ?? new Date();
  const today = localCalendarToday(now);
  const frame = frameFromCenterPct({
    leftPct: input.leftPct,
    topPct: input.topPct,
    limits: CALENDAR_SIZE_LIMITS,
  });
  return {
    id: normalizeSessionId(randomUUID()),
    moduleId: CALENDAR_MODULE_ID,
    leftPct: frame.leftPct,
    topPct: frame.topPct,
    widthPct: frame.widthPct,
    heightPct: frame.heightPct,
    title: validateCalendarTitle(input.title ?? CALENDAR_DEFAULT_TITLE),
    color: DEFAULT_LAB_OBJECT_COLOR,
    viewYear: today.year,
    viewMonth: today.month,
    events: [],
    boardId: null,
  };
}

export function canCreateCalendarInstance(
  data: ModuleLabCalendarsPageData,
): boolean {
  return data.calendars.length < CALENDAR_MAX_INSTANCES;
}

export function addCalendarInstance(
  data: ModuleLabCalendarsPageData,
  calendar: CalendarInstance,
): ModuleLabCalendarsPageData {
  if (!canCreateCalendarInstance(data)) return data;
  if (data.calendars.some((existing) => existing.id === calendar.id)) {
    return data;
  }
  return { calendars: [...data.calendars, calendar] };
}

function mapCalendar(
  data: ModuleLabCalendarsPageData,
  calendarId: string,
  update: (calendar: CalendarInstance) => CalendarInstance,
): ModuleLabCalendarsPageData {
  const id = calendarId.trim().toLowerCase();
  let changed = false;
  const calendars = data.calendars.map((calendar) => {
    if (calendar.id !== id) return calendar;
    const next = update(calendar);
    if (next === calendar) return calendar;
    changed = true;
    return next;
  });
  return changed ? { calendars } : data;
}

export function updateCalendarTitle(
  data: ModuleLabCalendarsPageData,
  calendarId: string,
  title: string,
): ModuleLabCalendarsPageData {
  const nextTitle = validateCalendarTitle(title);
  return mapCalendar(data, calendarId, (calendar) =>
    calendar.title === nextTitle ? calendar : { ...calendar, title: nextTitle },
  );
}

export function updateCalendarColor(
  data: ModuleLabCalendarsPageData,
  calendarId: string,
  color: LabObjectColor,
): ModuleLabCalendarsPageData {
  const nextColor = normalizeLabObjectColor(color);
  return mapCalendar(data, calendarId, (calendar) =>
    calendar.color === nextColor ? calendar : { ...calendar, color: nextColor },
  );
}

export function updateCalendarSize(
  data: ModuleLabCalendarsPageData,
  calendarId: string,
  size: LabObjectSize,
): ModuleLabCalendarsPageData {
  return mapCalendar(data, calendarId, (calendar) => {
    const next = clampLabObjectSize({
      widthPct: size.widthPct,
      heightPct: size.heightPct,
      originLeftPct: calendar.leftPct,
      originTopPct: calendar.topPct,
      limits: CALENDAR_SIZE_LIMITS,
    });
    if (
      calendar.widthPct === next.widthPct &&
      calendar.heightPct === next.heightPct
    ) {
      return calendar;
    }
    return { ...calendar, ...next };
  });
}

export function shiftCalendarView(
  data: ModuleLabCalendarsPageData,
  calendarId: string,
  deltaMonths: number,
): ModuleLabCalendarsPageData {
  return mapCalendar(data, calendarId, (calendar) => {
    const next = shiftCalendarMonth(
      calendar.viewYear,
      calendar.viewMonth,
      deltaMonths,
    );
    if (next.year === calendar.viewYear && next.month === calendar.viewMonth) {
      return calendar;
    }
    return { ...calendar, viewYear: next.year, viewMonth: next.month };
  });
}

export type AddCalendarEventInput = {
  date: string;
  title: string;
  randomUUID?: () => string;
};

export function addCalendarEvent(
  data: ModuleLabCalendarsPageData,
  calendarId: string,
  input: AddCalendarEventInput,
): ModuleLabCalendarsPageData {
  const parsed = parseLocalDateString(input.date);
  const title = validateCalendarEventTitle(input.title).trim();
  if (parsed == null || title === "") return data;
  return mapCalendar(data, calendarId, (calendar) => {
    if (calendar.events.length >= CALENDAR_MAX_EVENTS) return calendar;
    const randomUUID = input.randomUUID ?? (() => crypto.randomUUID());
    const event: CalendarEvent = {
      id: normalizeSessionId(randomUUID()),
      date: formatLocalDateString(parsed.year, parsed.month, parsed.day),
      title,
    };
    if (calendar.events.some((existing) => existing.id === event.id)) {
      return calendar;
    }
    return { ...calendar, events: [...calendar.events, event] };
  });
}

export function updateCalendarEvent(
  data: ModuleLabCalendarsPageData,
  calendarId: string,
  eventId: string,
  patch: { title?: string; date?: string },
): ModuleLabCalendarsPageData {
  const id = eventId.trim().toLowerCase();
  return mapCalendar(data, calendarId, (calendar) => {
    let changed = false;
    const events = calendar.events.map((event) => {
      if (event.id !== id) return event;
      const nextTitle =
        patch.title === undefined
          ? event.title
          : validateCalendarEventTitle(patch.title).trim() || event.title;
      const parsed =
        patch.date === undefined ? null : parseLocalDateString(patch.date);
      const nextDate =
        parsed == null
          ? event.date
          : formatLocalDateString(parsed.year, parsed.month, parsed.day);
      if (nextTitle === event.title && nextDate === event.date) return event;
      changed = true;
      return { ...event, title: nextTitle, date: nextDate };
    });
    return changed ? { ...calendar, events } : calendar;
  });
}

export function removeCalendarEvent(
  data: ModuleLabCalendarsPageData,
  calendarId: string,
  eventId: string,
): ModuleLabCalendarsPageData {
  const id = eventId.trim().toLowerCase();
  return mapCalendar(data, calendarId, (calendar) => {
    const events = calendar.events.filter((event) => event.id !== id);
    return events.length === calendar.events.length
      ? calendar
      : { ...calendar, events };
  });
}

export function updateCalendarBoardId(
  data: ModuleLabCalendarsPageData,
  calendarId: string,
  boardId: string | null,
): ModuleLabCalendarsPageData {
  const nextBoardId = normalizeLabBoardId(boardId);
  return mapCalendar(data, calendarId, (calendar) =>
    calendar.boardId === nextBoardId
      ? calendar
      : { ...calendar, boardId: nextBoardId },
  );
}

export function shiftCalendarOrigin(
  data: ModuleLabCalendarsPageData,
  calendarId: string,
  deltaLeftPct: number,
  deltaTopPct: number,
): ModuleLabCalendarsPageData {
  const dL = Number.isFinite(deltaLeftPct) ? deltaLeftPct : 0;
  const dT = Number.isFinite(deltaTopPct) ? deltaTopPct : 0;
  if (dL === 0 && dT === 0) return data;
  return mapCalendar(data, calendarId, (calendar) => ({
    ...calendar,
    leftPct: calendar.leftPct + dL,
    topPct: calendar.topPct + dT,
  }));
}

export function removeCalendarInstance(
  data: ModuleLabCalendarsPageData,
  calendarId: string,
): ModuleLabCalendarsPageData {
  const id = calendarId.trim().toLowerCase();
  const calendars = data.calendars.filter((calendar) => calendar.id !== id);
  return calendars.length === data.calendars.length ? data : { calendars };
}

export function resetModuleLabCalendarsPageData(): ModuleLabCalendarsPageData {
  return { calendars: [] };
}

export function worldDeltaToCalendarSizePct(
  deltaWorldX: number,
  deltaWorldY: number,
): { deltaWidthPct: number; deltaHeightPct: number } {
  return worldDeltaToLabSizePct(deltaWorldX, deltaWorldY);
}

export function applyCalendarResize(input: {
  widthPct: number;
  heightPct: number;
  originLeftPct: number;
  originTopPct: number;
  deltaWidthPct: number;
  deltaHeightPct: number;
}): LabObjectSize {
  return applyLabObjectResize({ ...input, limits: CALENDAR_SIZE_LIMITS });
}

export function nextCalendarSpawnPct(
  existingCount: number,
  base: WorldPct,
): WorldPct {
  return nextLabSpawnPct(existingCount, base);
}
