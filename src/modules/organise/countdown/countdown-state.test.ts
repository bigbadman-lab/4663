/**
 * COUNTDOWN V1 instance helpers and time math.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CANVAS_LINKS_PAGE_DATA_NAME } from "@/lib/social/canvas-link";
import { CANVAS_SNAPSHOTS_PAGE_DATA_NAME } from "@/lib/social/canvas-snapshot";
import { EPHEMERAL_DRAWINGS_PAGE_DATA_NAME } from "@/lib/social/ephemeral-drawing";
import { EPHEMERAL_TEXTS_PAGE_DATA_NAME } from "@/lib/social/ephemeral-text";
import { MODULE_LAB_NOTES_PAGE_DATA_NAME } from "@/modules/create/note/note-state";
import { MODULE_LAB_CHECKLISTS_PAGE_DATA_NAME } from "@/modules/organise/checklist/checklist-state";
import {
  addCountdownInstance,
  applyCountdownResize,
  canCreateCountdownInstance,
  COUNTDOWN_DEFAULT_OFFSET_MS,
  COUNTDOWN_HEIGHT_PCT_DEFAULT,
  COUNTDOWN_HEIGHT_PCT_MAX,
  COUNTDOWN_HEIGHT_PCT_MIN,
  COUNTDOWN_LABEL_MAX_LENGTH,
  COUNTDOWN_MAX_INSTANCES,
  COUNTDOWN_SPAWN_OFFSET_PCT,
  COUNTDOWN_WIDTH_PCT_DEFAULT,
  COUNTDOWN_WIDTH_PCT_MAX,
  COUNTDOWN_WIDTH_PCT_MIN,
  countdownParts,
  createCountdownInstance,
  defaultCountdownTargetAt,
  EMPTY_MODULE_LAB_COUNTDOWNS_PAGE_DATA,
  formatCountdownDays,
  formatCountdownHms,
  isoToLocalDateTime,
  localDateTimeToIso,
  MODULE_LAB_COUNTDOWNS_PAGE_DATA_NAME,
  nextCountdownSpawnPct,
  normalizeCountdownInstance,
  normalizeCountdownTargetAt,
  normalizeModuleLabCountdownsPageData,
  playhtmlCountdownElementId,
  removeCountdownInstance,
  resetModuleLabCountdownsPageData,
  updateCountdownColor,
  updateCountdownLabel,
  updateCountdownLocalDateTime,
  updateCountdownSize,
  updateCountdownTarget,
  validateCountdownLabel,
} from "@/modules/organise/countdown/countdown-state";

const ID_A = "550e8400-e29b-41d4-a716-446655440020";
const ID_B = "6ba7b810-9dad-11d1-80b4-00c04fd430cc";
const NOW = Date.UTC(2026, 7, 16, 21, 0, 0);

function paddedUuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

describe("countdownParts", () => {
  it("splits an exact 24h remainder into 1 day and 00:00:00", () => {
    const parts = countdownParts(NOW + 24 * 60 * 60 * 1000, NOW);
    assert.deepEqual(parts, {
      expired: false,
      days: 1,
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
  });

  it("splits multi-day remainders without using calendar months", () => {
    const parts = countdownParts(NOW + (2 * 86400 + 5 * 3600 + 7) * 1000, NOW);
    assert.equal(parts.expired, false);
    assert.equal(parts.days, 2);
    assert.equal(parts.hours, 5);
    assert.equal(parts.minutes, 0);
    assert.equal(parts.seconds, 7);
  });

  it("keeps sub-day remainders at 00 DAYS", () => {
    const parts = countdownParts(NOW + (4 * 3600 + 31 * 60 + 8) * 1000, NOW);
    assert.equal(parts.days, 0);
    assert.equal(parts.hours, 4);
    assert.equal(parts.minutes, 31);
    assert.equal(parts.seconds, 8);
    assert.equal(formatCountdownDays(parts.days), "00 DAYS");
    assert.equal(formatCountdownHms(parts), "04:31:08");
  });

  it("treats exact zero and the next millisecond as expired with no negatives", () => {
    assert.deepEqual(countdownParts(NOW, NOW), {
      expired: true,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
    assert.deepEqual(countdownParts(NOW - 1, NOW), {
      expired: true,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
    const expired = countdownParts(NOW - 90_000, NOW);
    assert.equal(expired.days >= 0, true);
    assert.equal(expired.hours >= 0, true);
    assert.equal(expired.minutes >= 0, true);
    assert.equal(expired.seconds >= 0, true);
  });

  it("floors fractional milliseconds at second and hour boundaries", () => {
    const almostSecond = countdownParts(NOW + 1999, NOW);
    assert.equal(almostSecond.seconds, 1);
    const hourBoundary = countdownParts(NOW + 3600 * 1000, NOW);
    assert.equal(hourBoundary.hours, 1);
    assert.equal(hourBoundary.minutes, 0);
    assert.equal(hourBoundary.seconds, 0);
    const minuteBoundary = countdownParts(NOW + 60 * 1000 - 1, NOW);
    assert.equal(minuteBoundary.minutes, 0);
    assert.equal(minuteBoundary.seconds, 59);
    const nan = countdownParts(Number.NaN, NOW);
    assert.equal(nan.expired, true);
    assert.equal(nan.days, 0);
  });
});

describe("COUNTDOWN instance helpers", () => {
  it("creates unique ids with a future default target and empty label", () => {
    const a = createCountdownInstance({
      leftPct: 40,
      topPct: 40,
      nowMs: NOW,
      randomUUID: () => ID_A,
    });
    const b = createCountdownInstance({
      leftPct: 44,
      topPct: 42,
      nowMs: NOW,
      randomUUID: () => ID_B,
    });
    assert.equal(a.id, ID_A);
    assert.equal(b.id, ID_B);
    assert.notEqual(a.id, b.id);
    assert.equal(a.moduleId, "countdown");
    assert.equal(a.label, "");
    assert.equal(a.color, "bone");
    assert.equal(a.targetAt, defaultCountdownTargetAt(NOW));
    assert.equal(Date.parse(a.targetAt), NOW + COUNTDOWN_DEFAULT_OFFSET_MS);
    assert.equal(a.widthPct, COUNTDOWN_WIDTH_PCT_DEFAULT);
    assert.equal(a.heightPct, COUNTDOWN_HEIGHT_PCT_DEFAULT);
    assert.notEqual(a.leftPct, b.leftPct);
  });

  it("clamps labels and normalizes invalid / missing targets to +24h", () => {
    assert.equal(validateCountdownLabel(""), "");
    const exact = "L".repeat(COUNTDOWN_LABEL_MAX_LENGTH);
    assert.equal(validateCountdownLabel(`${exact}x`).length, COUNTDOWN_LABEL_MAX_LENGTH);
    assert.equal(normalizeCountdownTargetAt("not-a-date", NOW), defaultCountdownTargetAt(NOW));
    assert.equal(normalizeCountdownTargetAt(undefined, NOW), defaultCountdownTargetAt(NOW));
    const iso = new Date(NOW + 3600_000).toISOString();
    assert.equal(normalizeCountdownTargetAt(iso, NOW), iso);
  });

  it("round-trips local date/time through an absolute ISO instant", () => {
    const iso = localDateTimeToIso("2026-09-01", "18:00");
    assert.ok(iso);
    const local = isoToLocalDateTime(iso);
    assert.equal(local.date, "2026-09-01");
    assert.equal(local.time, "18:00");
    assert.equal(localDateTimeToIso("2026-02-31", "18:00"), null);
    assert.equal(localDateTimeToIso("bad", "18:00"), null);
  });

  it("normalizes valid countdowns and drops malformed / duplicate ids", () => {
    const valid = createCountdownInstance({
      leftPct: 50,
      topPct: 50,
      label: "Launch",
      nowMs: NOW,
      randomUUID: () => ID_A,
    });
    const data = normalizeModuleLabCountdownsPageData(
      {
        countdowns: [
          valid,
          { ...valid, id: "not-a-uuid" },
          { ...valid, moduleId: "note" },
          valid,
          {
            id: ID_B,
            moduleId: "countdown",
            leftPct: 10,
            topPct: 10,
            label: "b",
            targetAt: "nope",
          },
        ],
      },
      NOW,
    );
    assert.equal(data.countdowns.length, 2);
    assert.equal(data.countdowns[0]?.id, ID_A);
    assert.equal(data.countdowns[1]?.id, ID_B);
    assert.equal(data.countdowns[1]?.color, "bone");
    assert.equal(data.countdowns[1]?.widthPct, COUNTDOWN_WIDTH_PCT_DEFAULT);
    assert.equal(data.countdowns[1]?.targetAt, defaultCountdownTargetAt(NOW));
    assert.equal(normalizeCountdownInstance(null), null);
    assert.deepEqual(normalizeModuleLabCountdownsPageData(null), {
      countdowns: [],
    });
  });

  it("updates one countdown without mutating another", () => {
    const a = createCountdownInstance({
      leftPct: 20,
      topPct: 20,
      label: "one",
      nowMs: NOW,
      randomUUID: () => ID_A,
    });
    const b = createCountdownInstance({
      leftPct: 30,
      topPct: 30,
      label: "two",
      nowMs: NOW,
      randomUUID: () => ID_B,
    });
    const start = { countdowns: [a, b] };
    const labeled = updateCountdownLabel(start, ID_A, "Launch");
    assert.equal(labeled.countdowns[0]?.label, "Launch");
    assert.equal(labeled.countdowns[1]?.label, "two");
    assert.equal(start.countdowns[0]?.label, "one");

    const retargeted = updateCountdownTarget(
      labeled,
      ID_A,
      new Date(NOW + 2 * COUNTDOWN_DEFAULT_OFFSET_MS).toISOString(),
      NOW,
    );
    assert.notEqual(retargeted.countdowns[0]?.targetAt, a.targetAt);
    assert.equal(retargeted.countdowns[1]?.targetAt, b.targetAt);

    const recoloured = updateCountdownColor(retargeted, ID_A, "yellow");
    assert.equal(recoloured.countdowns[0]?.color, "yellow");
    assert.equal(recoloured.countdowns[1]?.color, "bone");
    assert.equal(recoloured.countdowns[0]?.label, "Launch");
    assert.equal(start.countdowns[0]?.color, "bone");
  });

  it("updates local date/time into persisted ISO without changing the sibling", () => {
    const a = createCountdownInstance({
      leftPct: 20,
      topPct: 20,
      nowMs: NOW,
      randomUUID: () => ID_A,
    });
    const b = createCountdownInstance({
      leftPct: 30,
      topPct: 30,
      nowMs: NOW,
      randomUUID: () => ID_B,
    });
    const next = updateCountdownLocalDateTime(
      { countdowns: [a, b] },
      ID_A,
      "2026-09-01",
      "18:00",
    );
    assert.equal(isoToLocalDateTime(next.countdowns[0]!.targetAt).date, "2026-09-01");
    assert.equal(isoToLocalDateTime(next.countdowns[0]!.targetAt).time, "18:00");
    assert.equal(next.countdowns[1]?.targetAt, b.targetAt);
    assert.equal(
      updateCountdownLocalDateTime({ countdowns: [a] }, ID_A, "bad", "18:00")
        .countdowns[0]?.targetAt,
      a.targetAt,
    );
  });

  it("offsets spawn so later countdowns do not share the same origin", () => {
    const base = { leftPct: 50, topPct: 40 };
    const first = nextCountdownSpawnPct(0, base);
    const second = nextCountdownSpawnPct(1, base);
    assert.deepEqual(first, base);
    assert.equal(second.leftPct, 50 + COUNTDOWN_SPAWN_OFFSET_PCT);
  });

  it("RESET returns empty lab countdowns without touching other page-data names", () => {
    const filled = addCountdownInstance(
      EMPTY_MODULE_LAB_COUNTDOWNS_PAGE_DATA,
      createCountdownInstance({
        leftPct: 50,
        topPct: 50,
        nowMs: NOW,
        randomUUID: () => ID_A,
      }),
    );
    assert.equal(filled.countdowns.length, 1);
    assert.deepEqual(resetModuleLabCountdownsPageData(), { countdowns: [] });
    assert.equal(
      MODULE_LAB_COUNTDOWNS_PAGE_DATA_NAME,
      "4663-module-lab-countdowns",
    );
    assert.notEqual(
      MODULE_LAB_COUNTDOWNS_PAGE_DATA_NAME,
      MODULE_LAB_NOTES_PAGE_DATA_NAME,
    );
    assert.notEqual(
      MODULE_LAB_COUNTDOWNS_PAGE_DATA_NAME,
      MODULE_LAB_CHECKLISTS_PAGE_DATA_NAME,
    );
    assert.notEqual(
      MODULE_LAB_COUNTDOWNS_PAGE_DATA_NAME,
      EPHEMERAL_TEXTS_PAGE_DATA_NAME,
    );
    assert.notEqual(
      MODULE_LAB_COUNTDOWNS_PAGE_DATA_NAME,
      EPHEMERAL_DRAWINGS_PAGE_DATA_NAME,
    );
    assert.notEqual(
      MODULE_LAB_COUNTDOWNS_PAGE_DATA_NAME,
      CANVAS_LINKS_PAGE_DATA_NAME,
    );
    assert.notEqual(
      MODULE_LAB_COUNTDOWNS_PAGE_DATA_NAME,
      CANVAS_SNAPSHOTS_PAGE_DATA_NAME,
    );
  });

  it("caps instance count and removes by id", () => {
    let data = EMPTY_MODULE_LAB_COUNTDOWNS_PAGE_DATA;
    for (let i = 0; i < COUNTDOWN_MAX_INSTANCES; i += 1) {
      data = addCountdownInstance(
        data,
        createCountdownInstance({
          leftPct: 50,
          topPct: 50,
          nowMs: NOW,
          randomUUID: () => paddedUuid(i),
        }),
      );
    }
    assert.equal(data.countdowns.length, COUNTDOWN_MAX_INSTANCES);
    assert.equal(canCreateCountdownInstance(data), false);
    const extra = createCountdownInstance({
      leftPct: 10,
      topPct: 10,
      nowMs: NOW,
      randomUUID: () => ID_A,
    });
    assert.equal(
      addCountdownInstance(data, extra).countdowns.length,
      COUNTDOWN_MAX_INSTANCES,
    );
    assert.equal(
      removeCountdownInstance(data, data.countdowns[0]!.id).countdowns.length,
      COUNTDOWN_MAX_INSTANCES - 1,
    );
    assert.equal(
      playhtmlCountdownElementId(ID_A),
      `4663-lab-countdown-${ID_A}`,
    );
  });

  it("legacy countdowns without colour, size, or target normalize safely", () => {
    const legacy = normalizeCountdownInstance(
      {
        id: ID_A,
        moduleId: "countdown",
        leftPct: 40,
        topPct: 41,
        label: "keep me",
      },
      NOW,
    );
    assert.ok(legacy);
    assert.equal(legacy.color, "bone");
    assert.equal(legacy.widthPct, COUNTDOWN_WIDTH_PCT_DEFAULT);
    assert.equal(legacy.heightPct, COUNTDOWN_HEIGHT_PCT_DEFAULT);
    assert.equal(legacy.label, "keep me");
    assert.equal(legacy.targetAt, defaultCountdownTargetAt(NOW));
  });

  it("clamps resize and keeps sibling geometry/config intact", () => {
    const shrunk = applyCountdownResize({
      widthPct: COUNTDOWN_WIDTH_PCT_DEFAULT,
      heightPct: COUNTDOWN_HEIGHT_PCT_DEFAULT,
      originLeftPct: 20,
      originTopPct: 20,
      deltaWidthPct: -100,
      deltaHeightPct: -100,
    });
    assert.equal(shrunk.widthPct, COUNTDOWN_WIDTH_PCT_MIN);
    assert.equal(shrunk.heightPct, COUNTDOWN_HEIGHT_PCT_MIN);
    const grown = applyCountdownResize({
      widthPct: COUNTDOWN_WIDTH_PCT_DEFAULT,
      heightPct: COUNTDOWN_HEIGHT_PCT_DEFAULT,
      originLeftPct: 10,
      originTopPct: 10,
      deltaWidthPct: 100,
      deltaHeightPct: 100,
    });
    assert.equal(grown.widthPct, COUNTDOWN_WIDTH_PCT_MAX);
    assert.equal(grown.heightPct, COUNTDOWN_HEIGHT_PCT_MAX);

    const a = createCountdownInstance({
      leftPct: 20,
      topPct: 20,
      label: "one",
      nowMs: NOW,
      randomUUID: () => ID_A,
    });
    const b = createCountdownInstance({
      leftPct: 30,
      topPct: 30,
      label: "two",
      nowMs: NOW,
      randomUUID: () => ID_B,
    });
    const next = updateCountdownSize({ countdowns: [a, b] }, ID_A, {
      widthPct: COUNTDOWN_WIDTH_PCT_DEFAULT + 4,
      heightPct: COUNTDOWN_HEIGHT_PCT_DEFAULT + 3,
    });
    assert.ok(next.countdowns[0]!.widthPct > a.widthPct);
    assert.equal(next.countdowns[0]!.label, "one");
    assert.equal(next.countdowns[0]!.targetAt, a.targetAt);
    assert.equal(next.countdowns[1]!.widthPct, b.widthPct);
    assert.equal(next.countdowns[1]!.label, "two");
  });
});
