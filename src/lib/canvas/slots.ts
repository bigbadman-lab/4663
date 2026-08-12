/**
 * Deterministic sparse canvas slots for live event objects.
 */

import type { PublicEvent } from "@/lib/events/types";

export type CanvasSlot = {
  id: string;
  /** CSS left percentage */
  leftPct: number;
  /** CSS top percentage */
  topPct: number;
};

/** Six mid-canvas slots; leave top chrome clear (~top 18%). */
export const CANVAS_SLOTS: readonly CanvasSlot[] = [
  { id: "s0", leftPct: 14, topPct: 26 },
  { id: "s1", leftPct: 42, topPct: 22 },
  { id: "s2", leftPct: 70, topPct: 28 },
  { id: "s3", leftPct: 18, topPct: 52 },
  { id: "s4", leftPct: 46, topPct: 56 },
  { id: "s5", leftPct: 72, topPct: 50 },
] as const;

export type SlottedLiveEvent = {
  event: PublicEvent;
  slot: CanvasSlot;
};

export function preferredSlotIndex(eventId: string, slotCount: number): number {
  if (slotCount <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < eventId.length; i += 1) {
    hash = (hash * 31 + eventId.charCodeAt(i)) >>> 0;
  }
  return hash % slotCount;
}

/**
 * Assign each visible event a unique slot.
 * Events should already be newest-first; they claim preferred then next free.
 */
export function assignSlots(
  events: readonly PublicEvent[],
  slots: readonly CanvasSlot[] = CANVAS_SLOTS,
): SlottedLiveEvent[] {
  if (slots.length === 0) return [];

  const used = new Set<number>();
  const out: SlottedLiveEvent[] = [];

  for (const event of events) {
    const preferred = preferredSlotIndex(event.id, slots.length);
    for (let step = 0; step < slots.length; step += 1) {
      const index = (preferred + step) % slots.length;
      if (used.has(index)) continue;
      used.add(index);
      out.push({ event, slot: slots[index]! });
      break;
    }
  }

  return out;
}
