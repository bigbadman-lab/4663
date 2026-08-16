/**
 * SSRF-safe LINK metadata fetch. Server-only — do not import from client components.
 */

import { lookup as dnsLookup } from "node:dns/promises";
import {
  buildLinkPreview,
  type LinkPreview,
  type LinkPreviewErrorCode,
} from "@/lib/social/link-preview";
import {
  isBlockedIpAddress,
  isBlockedHostname,
  parsePublicHttpUrl,
} from "@/lib/social/link-url";

export const LINK_PREVIEW_TIMEOUT_MS = 8_000 as const;
export const LINK_PREVIEW_MAX_REDIRECTS = 3 as const;
export const LINK_PREVIEW_MAX_BYTES = 524_288 as const;
export const LINK_PREVIEW_USER_AGENT = "4663-link-preview/1.0" as const;

export type ResolveHostAddresses = (hostname: string) => Promise<string[]>;

export type FetchLinkPreviewDeps = {
  fetch?: typeof fetch;
  resolveAddresses?: ResolveHostAddresses;
  now?: () => number;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
};

export type FetchLinkPreviewResult =
  | { ok: true; preview: LinkPreview }
  | { ok: false; error: LinkPreviewErrorCode };

export async function resolvePublicHostAddresses(
  hostname: string,
): Promise<string[]> {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map((entry) => entry.address);
}

export async function assertPublicHttpDestination(
  rawUrl: string,
  resolveAddresses: ResolveHostAddresses,
): Promise<
  | { ok: true; normalized: string; url: URL }
  | { ok: false; error: "invalid_url" | "blocked" | "unavailable" }
> {
  const parsed = parsePublicHttpUrl(rawUrl);
  if (!parsed.ok) return parsed;

  if (isBlockedHostname(parsed.url.hostname)) {
    return { ok: false, error: "blocked" };
  }

  let addresses: string[];
  try {
    addresses = await resolveAddresses(parsed.url.hostname);
  } catch {
    return { ok: false, error: "unavailable" };
  }
  if (!addresses.length) {
    return { ok: false, error: "unavailable" };
  }
  for (const address of addresses) {
    if (isBlockedIpAddress(address)) {
      return { ok: false, error: "blocked" };
    }
  }
  return { ok: true, normalized: parsed.normalized, url: parsed.url };
}

export async function fetchLinkPreview(
  rawUrl: unknown,
  deps: FetchLinkPreviewDeps = {},
): Promise<FetchLinkPreviewResult> {
  if (typeof rawUrl !== "string") {
    return { ok: false, error: "invalid_url" };
  }

  const fetchImpl = deps.fetch ?? fetch;
  const resolveAddresses = deps.resolveAddresses ?? resolvePublicHostAddresses;
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? LINK_PREVIEW_TIMEOUT_MS;
  const maxRedirects = deps.maxRedirects ?? LINK_PREVIEW_MAX_REDIRECTS;
  const maxBytes = deps.maxBytes ?? LINK_PREVIEW_MAX_BYTES;
  const deadline = now() + timeoutMs;

  const initial = await assertPublicHttpDestination(rawUrl, resolveAddresses);
  if (!initial.ok) return initial;

  let current = initial.normalized;
  let html = "";
  let finalUrl = current;

  try {
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      const remaining = deadline - now();
      if (remaining <= 0) return { ok: false, error: "timeout" };

      const destination = await assertPublicHttpDestination(
        current,
        resolveAddresses,
      );
      if (!destination.ok) return destination;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      let response: Response;
      try {
        response = await fetchImpl(destination.normalized, {
          method: "GET",
          redirect: "manual",
          credentials: "omit",
          signal: controller.signal,
          headers: {
            Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
            "User-Agent": LINK_PREVIEW_USER_AGENT,
          },
        });
      } finally {
        clearTimeout(timer);
      }

      if (isRedirectStatus(response.status)) {
        if (hop === maxRedirects) {
          return { ok: false, error: "unavailable" };
        }
        const location = response.headers.get("location");
        if (!location) return { ok: false, error: "unavailable" };
        let next: URL;
        try {
          next = new URL(location, destination.normalized);
        } catch {
          return { ok: false, error: "invalid_url" };
        }
        current = next.href;
        continue;
      }

      if (!response.ok) {
        return { ok: false, error: "unavailable" };
      }

      const contentType = response.headers.get("content-type") ?? "";
      const lengthHeader = response.headers.get("content-length");
      if (lengthHeader) {
        const declared = Number(lengthHeader);
        if (Number.isFinite(declared) && declared > maxBytes) {
          return { ok: false, error: "oversized" };
        }
      }

      const body = await readLimitedBody(response, maxBytes);
      if (!body.ok) return body;

      if (!isHtmlLikeResponse(contentType, body.text)) {
        return { ok: false, error: "not_html" };
      }

      html = body.text;
      finalUrl = destination.normalized;
      break;
    }
  } catch (error) {
    if (isAbortError(error)) return { ok: false, error: "timeout" };
    return { ok: false, error: "unavailable" };
  }

  if (!html) return { ok: false, error: "unavailable" };

  const preview = buildLinkPreview({
    sourceUrl: initial.normalized,
    finalUrl,
    html,
  });
  if (!preview) return { ok: false, error: "unavailable" };
  return { ok: true, preview };
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function isHtmlLikeResponse(contentType: string, body: string): boolean {
  const type = contentType.toLowerCase();
  if (type.includes("text/html") || type.includes("application/xhtml")) {
    return true;
  }
  if (type && !type.includes("text/plain") && type !== "application/octet-stream") {
    return false;
  }
  const sniff = body.slice(0, 512).toLowerCase();
  return sniff.includes("<!doctype html") || sniff.includes("<html");
}

async function readLimitedBody(
  response: Response,
  maxBytes: number,
): Promise<
  { ok: true; text: string } | { ok: false; error: "oversized" | "unavailable" }
> {
  try {
    if (!response.body) {
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > maxBytes) return { ok: false, error: "oversized" };
      return { ok: true, text: buffer.toString("utf8") };
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, error: "oversized" };
      }
      chunks.push(value);
    }
    return { ok: true, text: Buffer.concat(chunks).toString("utf8") };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "AbortError"
  );
}
