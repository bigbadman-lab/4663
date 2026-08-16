/**
 * Canvas LINK PlayHTML objects — metadata snapshot at placement time.
 * Count is derived from page data keyed by ownerSessionId (refresh-durable).
 */

import { clampCanvasPct } from "@/lib/social/ephemeral-text";
import {
  normalizeLinkPreview,
  type LinkPreview,
} from "@/lib/social/link-preview";
import {
  isUuid,
  normalizeSessionId,
} from "@/lib/presence/session-id";

export const CANVAS_LINKS_PAGE_DATA_NAME = "4663-canvas-links" as const;
export const CANVAS_LINK_MAX_PER_OWNER = 3 as const;
export const CANVAS_LINK_LIMIT_MESSAGE = "LINK LIMIT REACHED · MAX 3" as const;

export type CanvasLinkObject = {
  linkId: string;
  ownerSessionId: string;
  url: string;
  canonicalUrl?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  domain: string;
  author?: string;
  leftPct: number;
  topPct: number;
  createdAt: string;
};

export type CanvasLinksPageData = {
  links: CanvasLinkObject[];
};

export const EMPTY_CANVAS_LINKS_PAGE_DATA: CanvasLinksPageData = {
  links: [],
};

export function playhtmlLinkElementId(linkId: string): string {
  return `4663-link-${linkId}`;
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

export function countCanvasLinksForOwner(
  data: CanvasLinksPageData,
  ownerSessionId: string,
): number {
  if (!isUuid(ownerSessionId)) return 0;
  const owner = normalizeSessionId(ownerSessionId);
  return data.links.filter((link) => link.ownerSessionId === owner).length;
}

export function canPlaceCanvasLink(
  data: CanvasLinksPageData,
  ownerSessionId: string,
): boolean {
  return countCanvasLinksForOwner(data, ownerSessionId) < CANVAS_LINK_MAX_PER_OWNER;
}

export function normalizeCanvasLinkObject(raw: unknown): CanvasLinkObject | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isUuid(record.linkId)) return null;
  if (!isUuid(record.ownerSessionId)) return null;
  if (!isFinitePct(record.leftPct) || !isFinitePct(record.topPct)) return null;
  if (record.leftPct < -5 || record.leftPct > 105) return null;
  if (record.topPct < -5 || record.topPct > 105) return null;
  if (typeof record.createdAt !== "string" || record.createdAt.trim() === "") {
    return null;
  }
  if (!Number.isFinite(Date.parse(record.createdAt))) return null;

  const preview = normalizeLinkPreview({
    url: record.url,
    canonicalUrl: record.canonicalUrl,
    title: record.title,
    description: record.description,
    imageUrl: record.imageUrl,
    siteName: record.siteName,
    domain: record.domain,
    author: record.author,
  });
  if (!preview) return null;

  const link: CanvasLinkObject = {
    linkId: normalizeSessionId(record.linkId),
    ownerSessionId: normalizeSessionId(record.ownerSessionId),
    url: preview.url,
    domain: preview.domain,
    leftPct: record.leftPct,
    topPct: record.topPct,
    createdAt: record.createdAt,
  };
  if (preview.canonicalUrl) link.canonicalUrl = preview.canonicalUrl;
  if (preview.title) link.title = preview.title;
  if (preview.description) link.description = preview.description;
  if (preview.imageUrl) link.imageUrl = preview.imageUrl;
  if (preview.siteName) link.siteName = preview.siteName;
  if (preview.author) link.author = preview.author;
  return link;
}

export function normalizeCanvasLinksPageData(raw: unknown): CanvasLinksPageData {
  if (raw === null || typeof raw !== "object") return { links: [] };
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.links)) return { links: [] };

  const seen = new Set<string>();
  const links: CanvasLinkObject[] = [];
  for (const item of record.links) {
    const normalized = normalizeCanvasLinkObject(item);
    if (!normalized) continue;
    if (seen.has(normalized.linkId)) continue;
    seen.add(normalized.linkId);
    links.push(normalized);
  }
  return { links };
}

export type CreateCanvasLinkInput = {
  preview: LinkPreview;
  ownerSessionId: string;
  leftPct: number;
  topPct: number;
  now?: () => Date;
  randomUUID?: () => string;
};

export type CreateCanvasLinkResult =
  | { ok: true; link: CanvasLinkObject }
  | { ok: false; error: string };

export function createCanvasLinkObject(
  input: CreateCanvasLinkInput,
): CreateCanvasLinkResult {
  if (!isUuid(input.ownerSessionId)) {
    return { ok: false, error: "Invalid session." };
  }
  const preview = normalizeLinkPreview(input.preview);
  if (!preview) {
    return { ok: false, error: "Invalid link." };
  }
  const randomUUID = input.randomUUID ?? (() => crypto.randomUUID());
  const now = input.now ?? (() => new Date());
  return {
    ok: true,
    link: {
      linkId: normalizeSessionId(randomUUID()),
      ownerSessionId: normalizeSessionId(input.ownerSessionId),
      url: preview.url,
      ...(preview.canonicalUrl ? { canonicalUrl: preview.canonicalUrl } : {}),
      ...(preview.title ? { title: preview.title } : {}),
      ...(preview.description ? { description: preview.description } : {}),
      ...(preview.imageUrl ? { imageUrl: preview.imageUrl } : {}),
      ...(preview.siteName ? { siteName: preview.siteName } : {}),
      domain: preview.domain,
      ...(preview.author ? { author: preview.author } : {}),
      leftPct: clampCanvasPct(input.leftPct),
      topPct: clampCanvasPct(input.topPct),
      createdAt: now().toISOString(),
    },
  };
}

export function upsertCanvasLink(
  data: CanvasLinksPageData,
  link: CanvasLinkObject,
): CanvasLinksPageData {
  const without = data.links.filter((item) => item.linkId !== link.linkId);
  return { links: [...without, link] };
}

export function removeCanvasLink(
  data: CanvasLinksPageData,
  linkId: string,
): CanvasLinksPageData {
  return { links: data.links.filter((link) => link.linkId !== linkId) };
}

export function removeCanvasLinksByOwner(
  data: CanvasLinksPageData,
  ownerSessionId: string,
): CanvasLinksPageData {
  const owner = normalizeSessionId(ownerSessionId);
  return {
    links: data.links.filter((link) => link.ownerSessionId !== owner),
  };
}

export function retainCanvasLinksForPresentOwners(
  data: CanvasLinksPageData,
  presentSessionIds: ReadonlySet<string>,
): CanvasLinksPageData {
  return {
    links: data.links.filter((link) => presentSessionIds.has(link.ownerSessionId)),
  };
}

export type CommitCanvasLinkPublishResult =
  | { ok: true; pageData: CanvasLinksPageData; link: CanvasLinkObject }
  | { ok: false; reason: "not-ready" | "rejected" | "limit" };

export function commitCanvasLinkPublish(input: {
  previous: CanvasLinksPageData;
  link: CanvasLinkObject;
  ready: boolean;
}): CommitCanvasLinkPublishResult {
  if (!input.ready) {
    return { ok: false, reason: "not-ready" };
  }
  const link = normalizeCanvasLinkObject(input.link);
  if (!link) {
    return { ok: false, reason: "rejected" };
  }
  const previous = normalizeCanvasLinksPageData(input.previous);
  const replacing = previous.links.some((item) => item.linkId === link.linkId);
  if (!replacing && !canPlaceCanvasLink(previous, link.ownerSessionId)) {
    return { ok: false, reason: "limit" };
  }
  return {
    ok: true,
    link,
    pageData: upsertCanvasLink(previous, link),
  };
}
