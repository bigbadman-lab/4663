/**
 * Browser helper for LINK metadata. Never scrapes the destination URL itself.
 */

import {
  LINK_PREVIEW_API_PATH,
  normalizeLinkPreview,
  type LinkPreview,
  type LinkPreviewClientError,
} from "@/lib/social/link-preview";
import { parsePublicHttpUrl } from "@/lib/social/link-url";

export type FetchLinkPreviewClientResult =
  | { ok: true; preview: LinkPreview }
  | { ok: false; error: LinkPreviewClientError };

export async function requestLinkPreview(
  url: string,
): Promise<FetchLinkPreviewClientResult> {
  const parsed = parsePublicHttpUrl(url);
  if (!parsed.ok) return parsed;

  try {
    const response = await fetch(LINK_PREVIEW_API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: parsed.normalized }),
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { ok: false, error: "unavailable" };
    }
    if (!response.ok) {
      return { ok: false, error: clientErrorFromPayload(payload) };
    }
    if (
      payload === null ||
      typeof payload !== "object" ||
      !("preview" in payload)
    ) {
      return { ok: false, error: "unavailable" };
    }
    const preview = normalizeLinkPreview(
      (payload as { preview: unknown }).preview,
    );
    if (!preview) return { ok: false, error: "unavailable" };
    return { ok: true, preview };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

export function linkPreviewErrorMessage(error: LinkPreviewClientError): string {
  switch (error) {
    case "invalid_url":
      return "Enter a public http(s) URL.";
    case "blocked":
      return "That URL cannot be used.";
    case "timeout":
      return "Preview timed out.";
    case "not_html":
      return "That page has no preview.";
    case "oversized":
      return "That page is too large.";
    case "limit":
      return "LINK LIMIT REACHED · MAX 3";
    default:
      return "Could not fetch preview.";
  }
}

function clientErrorFromPayload(payload: unknown): LinkPreviewClientError {
  if (
    payload !== null &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof (payload as { error: unknown }).error === "string"
  ) {
    const code = (payload as { error: string }).error;
    if (
      code === "invalid_url" ||
      code === "blocked" ||
      code === "unavailable" ||
      code === "timeout" ||
      code === "not_html" ||
      code === "oversized"
    ) {
      return code;
    }
  }
  return "unavailable";
}
