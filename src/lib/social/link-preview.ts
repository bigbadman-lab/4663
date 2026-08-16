/**
 * LINK metadata snapshot types + HTML extraction.
 * Never execute or persist page HTML. Output is sanitized strings/URLs only.
 */

import {
  LINK_URL_MAX_LENGTH,
  parsePublicHttpUrl,
  publicUrlDomain,
  resolveUrlAgainst,
} from "@/lib/social/link-url";

export const LINK_TITLE_MAX_LENGTH = 180 as const;
export const LINK_DESCRIPTION_MAX_LENGTH = 280 as const;
export const LINK_SITE_NAME_MAX_LENGTH = 80 as const;
export const LINK_AUTHOR_MAX_LENGTH = 80 as const;
export const LINK_DOMAIN_MAX_LENGTH = 253 as const;

export const LINK_PREVIEW_API_PATH = "/api/social/link-preview" as const;

export type LinkPreview = {
  url: string;
  canonicalUrl?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  domain: string;
  author?: string;
};

export type LinkPreviewErrorCode =
  | "invalid_url"
  | "blocked"
  | "unavailable"
  | "timeout"
  | "not_html"
  | "oversized";

export type LinkPreviewClientError = LinkPreviewErrorCode | "limit";

export function sanitizeLinkText(
  raw: unknown,
  maxLength: number,
): string | undefined {
  if (typeof raw !== "string") return undefined;
  const stripped = stripTags(decodeHtmlEntities(raw))
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return undefined;
  return stripped.slice(0, maxLength);
}

export function sanitizeOptionalHttpUrl(
  raw: unknown,
  baseUrl: string,
): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > LINK_URL_MAX_LENGTH) return undefined;
  const resolved = resolveUrlAgainst(baseUrl, trimmed);
  if (!resolved) return undefined;
  const parsed = parsePublicHttpUrl(resolved.href);
  if (!parsed.ok) return undefined;
  return parsed.normalized;
}

export function extractLinkMetadata(html: string): {
  ogTitle?: string;
  twitterTitle?: string;
  documentTitle?: string;
  ogDescription?: string;
  twitterDescription?: string;
  metaDescription?: string;
  ogImage?: string;
  ogImageSecureUrl?: string;
  twitterImage?: string;
  siteName?: string;
  author?: string;
  canonicalUrl?: string;
  ogUrl?: string;
} {
  const head = isolateHtmlHead(html);
  return {
    ogTitle: metaContent(head, "property", "og:title"),
    twitterTitle:
      metaContent(head, "name", "twitter:title") ??
      metaContent(head, "property", "twitter:title"),
    documentTitle: documentTitle(head),
    ogDescription: metaContent(head, "property", "og:description"),
    twitterDescription:
      metaContent(head, "name", "twitter:description") ??
      metaContent(head, "property", "twitter:description"),
    metaDescription: metaContent(head, "name", "description"),
    ogImage: metaContent(head, "property", "og:image"),
    ogImageSecureUrl: metaContent(head, "property", "og:image:secure_url"),
    twitterImage:
      metaContent(head, "name", "twitter:image") ??
      metaContent(head, "name", "twitter:image:src") ??
      metaContent(head, "property", "twitter:image"),
    siteName: metaContent(head, "property", "og:site_name"),
    author:
      metaContent(head, "name", "author") ??
      metaContent(head, "property", "article:author") ??
      metaContent(head, "property", "og:article:author"),
    canonicalUrl: linkRelHref(head, "canonical"),
    ogUrl: metaContent(head, "property", "og:url"),
  };
}

export function buildLinkPreview(input: {
  sourceUrl: string;
  finalUrl: string;
  html: string;
}): LinkPreview | null {
  const source = parsePublicHttpUrl(input.sourceUrl);
  const finalParsed = parsePublicHttpUrl(input.finalUrl);
  if (!source.ok || !finalParsed.ok) return null;

  const meta = extractLinkMetadata(input.html);
  const base = finalParsed.normalized;
  const title =
    sanitizeLinkText(meta.ogTitle, LINK_TITLE_MAX_LENGTH) ??
    sanitizeLinkText(meta.twitterTitle, LINK_TITLE_MAX_LENGTH) ??
    sanitizeLinkText(meta.documentTitle, LINK_TITLE_MAX_LENGTH);
  const description =
    sanitizeLinkText(meta.ogDescription, LINK_DESCRIPTION_MAX_LENGTH) ??
    sanitizeLinkText(meta.twitterDescription, LINK_DESCRIPTION_MAX_LENGTH) ??
    sanitizeLinkText(meta.metaDescription, LINK_DESCRIPTION_MAX_LENGTH);
  const imageUrl =
    sanitizeOptionalHttpUrl(meta.ogImage, base) ??
    sanitizeOptionalHttpUrl(meta.ogImageSecureUrl, base) ??
    sanitizeOptionalHttpUrl(meta.twitterImage, base);
  const canonicalUrl =
    sanitizeOptionalHttpUrl(meta.canonicalUrl, base) ??
    sanitizeOptionalHttpUrl(meta.ogUrl, base);
  const siteName = sanitizeLinkText(meta.siteName, LINK_SITE_NAME_MAX_LENGTH);
  const author = sanitizeLinkText(meta.author, LINK_AUTHOR_MAX_LENGTH);
  const domain =
    sanitizeLinkText(finalParsed.domain, LINK_DOMAIN_MAX_LENGTH) ??
    publicUrlDomain(finalParsed.url);

  const preview: LinkPreview = {
    url: source.normalized,
    domain,
  };
  if (canonicalUrl) preview.canonicalUrl = canonicalUrl;
  if (title) preview.title = title;
  if (description) preview.description = description;
  if (imageUrl) preview.imageUrl = imageUrl;
  if (siteName) preview.siteName = siteName;
  if (author) preview.author = author;
  return preview;
}

export function normalizeLinkPreview(raw: unknown): LinkPreview | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const parsed = parsePublicHttpUrl(record.url);
  if (!parsed.ok) return null;
  const domain =
    sanitizeLinkText(record.domain, LINK_DOMAIN_MAX_LENGTH) ?? parsed.domain;
  if (!domain) return null;

  const preview: LinkPreview = {
    url: parsed.normalized,
    domain,
  };
  const canonicalUrl = sanitizeOptionalHttpUrl(
    record.canonicalUrl,
    parsed.normalized,
  );
  const title = sanitizeLinkText(record.title, LINK_TITLE_MAX_LENGTH);
  const description = sanitizeLinkText(
    record.description,
    LINK_DESCRIPTION_MAX_LENGTH,
  );
  const imageUrl = sanitizeOptionalHttpUrl(record.imageUrl, parsed.normalized);
  const siteName = sanitizeLinkText(record.siteName, LINK_SITE_NAME_MAX_LENGTH);
  const author = sanitizeLinkText(record.author, LINK_AUTHOR_MAX_LENGTH);
  if (canonicalUrl) preview.canonicalUrl = canonicalUrl;
  if (title) preview.title = title;
  if (description) preview.description = description;
  if (imageUrl) preview.imageUrl = imageUrl;
  if (siteName) preview.siteName = siteName;
  if (author) preview.author = author;
  return preview;
}

function isolateHtmlHead(html: string): string {
  const sliced = html.slice(0, 200_000);
  const withoutComments = sliced.replace(/<!--[\s\S]*?-->/g, " ");
  const withoutDanger = withoutComments
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ");
  const headMatch = withoutDanger.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  return headMatch ? headMatch[1] : withoutDanger.slice(0, 80_000);
}

function documentTitle(head: string): string | undefined {
  const match = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1] : undefined;
}

function metaContent(
  head: string,
  attr: "property" | "name",
  value: string,
): string | undefined {
  const tags = head.match(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi) ?? [];
  const needle = value.toLowerCase();
  for (const tag of tags) {
    const key = readAttr(tag, attr);
    if (!key || key.toLowerCase() !== needle) continue;
    const content = readAttr(tag, "content");
    if (content !== undefined) return content;
  }
  return undefined;
}

function linkRelHref(head: string, rel: string): string | undefined {
  const tags = head.match(/<link\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi) ?? [];
  const needle = rel.toLowerCase();
  for (const tag of tags) {
    const relValue = readAttr(tag, "rel");
    if (!relValue) continue;
    const rels = relValue.toLowerCase().split(/\s+/);
    if (!rels.includes(needle)) continue;
    const href = readAttr(tag, "href");
    if (href !== undefined) return href;
  }
  return undefined;
}

function readAttr(tag: string, name: string): string | undefined {
  const double = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"),
  );
  if (double) return double[1];
  const single = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, "i"),
  );
  if (single) return single[1];
  return undefined;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : " ";
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : " ";
    })
    .replace(/&amp;/gi, "&");
}
