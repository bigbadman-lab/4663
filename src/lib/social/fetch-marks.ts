/**
 * Browser fetch helpers for Social 6 MARK API.
 */

import {
  MARKS_API_PATH,
  normalizeCanvasMark,
  type CanvasMark,
} from "@/lib/social/canvas-mark";

export async function fetchActiveCanvasMarks(
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<CanvasMark[]> {
  const res = await fetchFn(MARKS_API_PATH, {
    method: "GET",
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    throw new Error(`marks GET HTTP ${res.status}`);
  }

  const body: unknown = await res.json();
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !Array.isArray((body as { marks?: unknown }).marks)
  ) {
    throw new Error("marks GET malformed");
  }

  const marks: CanvasMark[] = [];
  for (const item of (body as { marks: unknown[] }).marks) {
    const mark = normalizeCanvasMark(item);
    if (mark) marks.push(mark);
  }
  return marks;
}

export type PostCanvasMarkInput = {
  ownerSessionId: string;
  ownerDisplayName: string;
  ownerColour: string;
  body: string;
  leftPct: number;
  topPct: number;
};

export type PostCanvasMarkResult =
  | { ok: true; mark: CanvasMark }
  | { ok: false; error: string; status: number };

export async function postCanvasMark(
  input: PostCanvasMarkInput,
  fetchFn: typeof fetch = fetch,
): Promise<PostCanvasMarkResult> {
  const res = await fetchFn(MARKS_API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, error: "invalid_response", status: res.status };
  }

  if (res.status === 201 || res.ok) {
    const mark = normalizeCanvasMark(
      payload !== null &&
        typeof payload === "object" &&
        !Array.isArray(payload)
        ? (payload as { mark?: unknown }).mark
        : null,
    );
    if (!mark) {
      return { ok: false, error: "invalid_response", status: res.status };
    }
    return { ok: true, mark };
  }

  const error =
    payload !== null &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    typeof (payload as { error?: unknown }).error === "string"
      ? (payload as { error: string }).error
      : "create_failed";

  return { ok: false, error, status: res.status };
}
