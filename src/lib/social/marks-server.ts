/**
 * Social 6 — server-side MARK load/create (service-role).
 */

import { CHAIN_ID } from "@/lib/pons/constants";
import type { PresenceSupabase } from "@/lib/presence/supabase-server";
import {
  CANVAS_MARKS_TABLE,
  canvasMarkFromRow,
  parseCreateMarkInput,
  type CanvasMark,
} from "@/lib/social/canvas-mark";

export type LoadActiveMarksResult =
  | { ok: true; marks: CanvasMark[] }
  | { ok: false; error: "marks_unavailable" };

export async function loadActiveCanvasMarks(
  supabase: PresenceSupabase,
  now: Date = new Date(),
): Promise<LoadActiveMarksResult> {
  const { data, error } = await supabase
    .from(CANVAS_MARKS_TABLE)
    .select(
      "id, chain_id, owner_session_id, owner_display_name, owner_colour, body, left_pct, top_pct, created_at, expires_at",
    )
    .eq("chain_id", CHAIN_ID)
    .gt("expires_at", now.toISOString())
    .order("created_at", { ascending: true });

  if (error) {
    return { ok: false, error: "marks_unavailable" };
  }

  const marks: CanvasMark[] = [];
  for (const row of data ?? []) {
    const mark = canvasMarkFromRow(row);
    if (mark) marks.push(mark);
  }
  return { ok: true, marks };
}

export type CreateCanvasMarkResult =
  | { ok: true; mark: CanvasMark; status: 201 }
  | {
      ok: false;
      error: string;
      status: number;
      mark?: CanvasMark;
    };

export async function createCanvasMark(
  supabase: PresenceSupabase,
  body: unknown,
): Promise<CreateCanvasMarkResult> {
  const parsed = parseCreateMarkInput(body);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, status: 400 };
  }

  const { data, error } = await supabase
    .from(CANVAS_MARKS_TABLE)
    .insert({
      chain_id: CHAIN_ID,
      owner_session_id: parsed.ownerSessionId,
      owner_display_name: parsed.ownerDisplayName,
      owner_colour: parsed.ownerColour,
      body: parsed.body,
      left_pct: parsed.leftPct,
      top_pct: parsed.topPct,
    })
    .select(
      "id, chain_id, owner_session_id, owner_display_name, owner_colour, body, left_pct, top_pct, created_at, expires_at",
    )
    .single();

  if (error) {
    // Unique violation on owner_session_id
    if (error.code === "23505") {
      return { ok: false, error: "mark_exists", status: 409 };
    }
    return { ok: false, error: "insert_failed", status: 500 };
  }

  const mark = canvasMarkFromRow(data);
  if (!mark) {
    return { ok: false, error: "insert_failed", status: 500 };
  }
  return { ok: true, mark, status: 201 };
}
