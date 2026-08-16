/**
 * COUNTDOWN V1 — Module Lab instance helpers.
 * PlayHTML page-data stores configuration only. Display time is derived.
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

export const COUNTDOWN_MODULE_ID = "countdown" as const;

export const MODULE_LAB_COUNTDOWNS_PAGE_DATA_NAME =
  "4663-module-lab-countdowns" as const;

export const COUNTDOWN_MAX_INSTANCES = 40 as const;
export const COUNTDOWN_LABEL_MAX_LENGTH = 80 as const;
export const COUNTDOWN_DEFAULT_OFFSET_MS = 24 * 60 * 60 * 1000;
export const COUNTDOWN_SPAWN_OFFSET_PCT = LAB_SPAWN_OFFSET_PCT;

export const COUNTDOWN_WIDTH_PCT_DEFAULT = (240 / WORLD_WIDTH_PX) * 100;
export const COUNTDOWN_HEIGHT_PCT_DEFAULT = (176 / WORLD_HEIGHT_PX) * 100;
export const COUNTDOWN_WIDTH_PCT_MIN = (180 / WORLD_WIDTH_PX) * 100;
export const COUNTDOWN_HEIGHT_PCT_MIN = (140 / WORLD_HEIGHT_PX) * 100;
export const COUNTDOWN_WIDTH_PCT_MAX = (960 / WORLD_WIDTH_PX) * 100;
export const COUNTDOWN_HEIGHT_PCT_MAX = (800 / WORLD_HEIGHT_PX) * 100;

export const COUNTDOWN_SIZE_LIMITS: LabObjectSizeLimits = {
  widthPctMin: COUNTDOWN_WIDTH_PCT_MIN,
  heightPctMin: COUNTDOWN_HEIGHT_PCT_MIN,
  widthPctMax: COUNTDOWN_WIDTH_PCT_MAX,
  heightPctMax: COUNTDOWN_HEIGHT_PCT_MAX,
  widthPctDefault: COUNTDOWN_WIDTH_PCT_DEFAULT,
  heightPctDefault: COUNTDOWN_HEIGHT_PCT_DEFAULT,
};

export type CountdownInstance = {
  id: string;
  moduleId: typeof COUNTDOWN_MODULE_ID;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  label: string;
  targetAt: string;
  color: LabObjectColor;
  boardId: string | null;
};

export type ModuleLabCountdownsPageData = {
  countdowns: CountdownInstance[];
};

export const EMPTY_MODULE_LAB_COUNTDOWNS_PAGE_DATA: ModuleLabCountdownsPageData =
  { countdowns: [] };

export type CountdownParts = {
  expired: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

const MONTH_LABELS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

export function playhtmlCountdownElementId(countdownId: string): string {
  return `4663-lab-countdown-${countdownId}`;
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
  return String(value).padStart(2, "0");
}

export function validateCountdownLabel(raw: unknown): string {
  if (typeof raw !== "string") return "";
  if (raw.length <= COUNTDOWN_LABEL_MAX_LENGTH) return raw;
  return raw.slice(0, COUNTDOWN_LABEL_MAX_LENGTH);
}

export function defaultCountdownTargetAt(nowMs: number = Date.now()): string {
  return new Date(nowMs + COUNTDOWN_DEFAULT_OFFSET_MS).toISOString();
}

export function parseCountdownTargetMs(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export function normalizeCountdownTargetAt(
  raw: unknown,
  nowMs: number = Date.now(),
): string {
  const ms = parseCountdownTargetMs(raw);
  if (ms == null) return defaultCountdownTargetAt(nowMs);
  return new Date(ms).toISOString();
}

/**
 * Local calendar date + local clock → absolute ISO instant.
 * No timezone selector; the browser's local zone is the input zone.
 */
export function localDateTimeToIso(
  date: string,
  time: string,
): string | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!dateMatch || !timeMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const seconds = Number(timeMatch[3] ?? 0);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hours > 23 ||
    minutes > 59 ||
    seconds > 59
  ) {
    return null;
  }
  const dt = new Date(year, month - 1, day, hours, minutes, seconds, 0);
  if (Number.isNaN(dt.getTime())) return null;
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day
  ) {
    return null;
  }
  return dt.toISOString();
}

export function isoToLocalDateTime(iso: string): {
  date: string;
  time: string;
} {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) {
    return isoToLocalDateTime(defaultCountdownTargetAt());
  }
  return {
    date: `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`,
    time: `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`,
  };
}

export function countdownParts(
  targetMs: number,
  nowMs: number,
): CountdownParts {
  if (!Number.isFinite(targetMs) || !Number.isFinite(nowMs)) {
    return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  const remainingMs = targetMs - nowMs;
  if (remainingMs <= 0) {
    return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  const totalSeconds = Math.floor(remainingMs / 1000);
  return {
    expired: false,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function formatCountdownDays(days: number): string {
  return `${pad2(Math.max(0, days))} DAYS`;
}

export function formatCountdownHms(parts: CountdownParts): string {
  return `${pad2(parts.hours)}:${pad2(parts.minutes)}:${pad2(parts.seconds)}`;
}

export function formatCountdownTarget(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  const month = MONTH_LABELS[dt.getMonth()] ?? "";
  return `${month} ${pad2(dt.getDate())} · ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

function defaultCountdownSizeForOrigin(
  leftPct: number,
  topPct: number,
): LabObjectSize {
  return clampLabObjectSize({
    widthPct: COUNTDOWN_WIDTH_PCT_DEFAULT,
    heightPct: COUNTDOWN_HEIGHT_PCT_DEFAULT,
    originLeftPct: leftPct,
    originTopPct: topPct,
    limits: COUNTDOWN_SIZE_LIMITS,
  });
}

export function normalizeCountdownInstance(
  raw: unknown,
  nowMs: number = Date.now(),
): CountdownInstance | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isUuid(record.id)) return null;
  if (record.moduleId !== COUNTDOWN_MODULE_ID) return null;
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
          widthPct: widthRaw ?? COUNTDOWN_WIDTH_PCT_DEFAULT,
          heightPct: heightRaw ?? COUNTDOWN_HEIGHT_PCT_DEFAULT,
          originLeftPct: leftPct,
          originTopPct: topPct,
          limits: COUNTDOWN_SIZE_LIMITS,
        })
      : defaultCountdownSizeForOrigin(leftPct, topPct);

  return {
    id: normalizeSessionId(record.id),
    moduleId: COUNTDOWN_MODULE_ID,
    leftPct,
    topPct,
    widthPct: size.widthPct,
    heightPct: size.heightPct,
    label: validateCountdownLabel(record.label),
    targetAt: normalizeCountdownTargetAt(record.targetAt, nowMs),
    color: normalizeLabObjectColor(record.color),
    boardId: normalizeLabBoardId(record.boardId),
  };
}

export function normalizeModuleLabCountdownsPageData(
  raw: unknown,
  nowMs: number = Date.now(),
): ModuleLabCountdownsPageData {
  if (raw === null || typeof raw !== "object") {
    return { countdowns: [] };
  }
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.countdowns)) {
    return { countdowns: [] };
  }
  const seen = new Set<string>();
  const countdowns: CountdownInstance[] = [];
  for (const item of record.countdowns) {
    const normalized = normalizeCountdownInstance(item, nowMs);
    if (!normalized) continue;
    if (seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    countdowns.push(normalized);
    if (countdowns.length >= COUNTDOWN_MAX_INSTANCES) break;
  }
  return { countdowns };
}

export type CreateCountdownInstanceInput = {
  leftPct: number;
  topPct: number;
  label?: string;
  targetAt?: string;
  nowMs?: number;
  randomUUID?: () => string;
};

export function createCountdownInstance(
  input: CreateCountdownInstanceInput,
): CountdownInstance {
  const randomUUID = input.randomUUID ?? (() => crypto.randomUUID());
  const nowMs = input.nowMs ?? Date.now();
  const frame = frameFromCenterPct({
    leftPct: input.leftPct,
    topPct: input.topPct,
    limits: COUNTDOWN_SIZE_LIMITS,
  });
  return {
    id: normalizeSessionId(randomUUID()),
    moduleId: COUNTDOWN_MODULE_ID,
    leftPct: frame.leftPct,
    topPct: frame.topPct,
    widthPct: frame.widthPct,
    heightPct: frame.heightPct,
    label: validateCountdownLabel(input.label ?? ""),
    targetAt: normalizeCountdownTargetAt(input.targetAt, nowMs),
    color: DEFAULT_LAB_OBJECT_COLOR,
    boardId: null,
  };
}

export function canCreateCountdownInstance(
  data: ModuleLabCountdownsPageData,
): boolean {
  return data.countdowns.length < COUNTDOWN_MAX_INSTANCES;
}

export function addCountdownInstance(
  data: ModuleLabCountdownsPageData,
  countdown: CountdownInstance,
): ModuleLabCountdownsPageData {
  if (!canCreateCountdownInstance(data)) return data;
  if (data.countdowns.some((existing) => existing.id === countdown.id)) {
    return data;
  }
  return { countdowns: [...data.countdowns, countdown] };
}

function mapCountdown(
  data: ModuleLabCountdownsPageData,
  countdownId: string,
  update: (countdown: CountdownInstance) => CountdownInstance,
): ModuleLabCountdownsPageData {
  const id = countdownId.trim().toLowerCase();
  let changed = false;
  const countdowns = data.countdowns.map((countdown) => {
    if (countdown.id !== id) return countdown;
    const next = update(countdown);
    if (next === countdown) return countdown;
    changed = true;
    return next;
  });
  return changed ? { countdowns } : data;
}

export function updateCountdownLabel(
  data: ModuleLabCountdownsPageData,
  countdownId: string,
  label: string,
): ModuleLabCountdownsPageData {
  const nextLabel = validateCountdownLabel(label);
  return mapCountdown(data, countdownId, (countdown) =>
    countdown.label === nextLabel
      ? countdown
      : { ...countdown, label: nextLabel },
  );
}

export function updateCountdownTarget(
  data: ModuleLabCountdownsPageData,
  countdownId: string,
  targetAt: string,
  nowMs: number = Date.now(),
): ModuleLabCountdownsPageData {
  const nextTarget = normalizeCountdownTargetAt(targetAt, nowMs);
  return mapCountdown(data, countdownId, (countdown) =>
    countdown.targetAt === nextTarget
      ? countdown
      : { ...countdown, targetAt: nextTarget },
  );
}

export function updateCountdownLocalDateTime(
  data: ModuleLabCountdownsPageData,
  countdownId: string,
  date: string,
  time: string,
): ModuleLabCountdownsPageData {
  const iso = localDateTimeToIso(date, time);
  if (iso == null) return data;
  return updateCountdownTarget(data, countdownId, iso);
}

export function updateCountdownColor(
  data: ModuleLabCountdownsPageData,
  countdownId: string,
  color: LabObjectColor,
): ModuleLabCountdownsPageData {
  const nextColor = normalizeLabObjectColor(color);
  return mapCountdown(data, countdownId, (countdown) =>
    countdown.color === nextColor
      ? countdown
      : { ...countdown, color: nextColor },
  );
}

export function updateCountdownSize(
  data: ModuleLabCountdownsPageData,
  countdownId: string,
  size: LabObjectSize,
): ModuleLabCountdownsPageData {
  return mapCountdown(data, countdownId, (countdown) => {
    const next = clampLabObjectSize({
      widthPct: size.widthPct,
      heightPct: size.heightPct,
      originLeftPct: countdown.leftPct,
      originTopPct: countdown.topPct,
      limits: COUNTDOWN_SIZE_LIMITS,
    });
    if (
      countdown.widthPct === next.widthPct &&
      countdown.heightPct === next.heightPct
    ) {
      return countdown;
    }
    return { ...countdown, ...next };
  });
}

export function updateCountdownBoardId(
  data: ModuleLabCountdownsPageData,
  countdownId: string,
  boardId: string | null,
): ModuleLabCountdownsPageData {
  const nextBoardId = normalizeLabBoardId(boardId);
  return mapCountdown(data, countdownId, (countdown) =>
    countdown.boardId === nextBoardId
      ? countdown
      : { ...countdown, boardId: nextBoardId },
  );
}

export function shiftCountdownOrigin(
  data: ModuleLabCountdownsPageData,
  countdownId: string,
  deltaLeftPct: number,
  deltaTopPct: number,
): ModuleLabCountdownsPageData {
  const dL = Number.isFinite(deltaLeftPct) ? deltaLeftPct : 0;
  const dT = Number.isFinite(deltaTopPct) ? deltaTopPct : 0;
  if (dL === 0 && dT === 0) return data;
  return mapCountdown(data, countdownId, (countdown) => ({
    ...countdown,
    leftPct: countdown.leftPct + dL,
    topPct: countdown.topPct + dT,
  }));
}

export function removeCountdownInstance(
  data: ModuleLabCountdownsPageData,
  countdownId: string,
): ModuleLabCountdownsPageData {
  const id = countdownId.trim().toLowerCase();
  const countdowns = data.countdowns.filter((row) => row.id !== id);
  return countdowns.length === data.countdowns.length ? data : { countdowns };
}

export function resetModuleLabCountdownsPageData(): ModuleLabCountdownsPageData {
  return { countdowns: [] };
}

export function worldDeltaToCountdownSizePct(
  deltaWorldX: number,
  deltaWorldY: number,
): { deltaWidthPct: number; deltaHeightPct: number } {
  return worldDeltaToLabSizePct(deltaWorldX, deltaWorldY);
}

export function applyCountdownResize(input: {
  widthPct: number;
  heightPct: number;
  originLeftPct: number;
  originTopPct: number;
  deltaWidthPct: number;
  deltaHeightPct: number;
}): LabObjectSize {
  return applyLabObjectResize({ ...input, limits: COUNTDOWN_SIZE_LIMITS });
}

export function nextCountdownSpawnPct(
  existingCount: number,
  base: WorldPct,
): WorldPct {
  return nextLabSpawnPct(existingCount, base);
}
