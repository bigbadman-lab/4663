/**
 * LINK metadata extraction + sanitization.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLinkPreview,
  extractLinkMetadata,
  LINK_TITLE_MAX_LENGTH,
  normalizeLinkPreview,
  sanitizeLinkText,
} from "@/lib/social/link-preview";

const BASE = "https://news.example.com/story/1";

function html(head: string): string {
  return `<!doctype html><html><head>${head}</head><body></body></html>`;
}

describe("LINK metadata precedence", () => {
  it("OG title wins over twitter and document title", () => {
    const preview = buildLinkPreview({
      sourceUrl: BASE,
      finalUrl: BASE,
      html: html(`
        <title>Document</title>
        <meta name="twitter:title" content="Twitter title">
        <meta property="og:title" content="OG title">
      `),
    });
    assert.equal(preview?.title, "OG title");
  });

  it("twitter title falls back before document title", () => {
    const preview = buildLinkPreview({
      sourceUrl: BASE,
      finalUrl: BASE,
      html: html(`
        <title>Document</title>
        <meta name="twitter:title" content="Twitter title">
      `),
    });
    assert.equal(preview?.title, "Twitter title");
  });

  it("description falls back og → twitter → meta", () => {
    const og = buildLinkPreview({
      sourceUrl: BASE,
      finalUrl: BASE,
      html: html(`
        <meta property="og:description" content="OG desc">
        <meta name="twitter:description" content="Tw desc">
        <meta name="description" content="Meta desc">
      `),
    });
    assert.equal(og?.description, "OG desc");

    const twitter = buildLinkPreview({
      sourceUrl: BASE,
      finalUrl: BASE,
      html: html(`
        <meta name="twitter:description" content="Tw desc">
        <meta name="description" content="Meta desc">
      `),
    });
    assert.equal(twitter?.description, "Tw desc");

    const meta = buildLinkPreview({
      sourceUrl: BASE,
      finalUrl: BASE,
      html: html(`<meta name="description" content="Meta desc">`),
    });
    assert.equal(meta?.description, "Meta desc");
  });

  it("og:image wins over twitter image", () => {
    const preview = buildLinkPreview({
      sourceUrl: BASE,
      finalUrl: BASE,
      html: html(`
        <meta property="og:image" content="https://cdn.example.com/og.jpg">
        <meta name="twitter:image" content="https://cdn.example.com/tw.jpg">
      `),
    });
    assert.equal(preview?.imageUrl, "https://cdn.example.com/og.jpg");
  });

  it("twitter image fallback works", () => {
    const preview = buildLinkPreview({
      sourceUrl: BASE,
      finalUrl: BASE,
      html: html(
        `<meta name="twitter:image" content="https://cdn.example.com/tw.jpg">`,
      ),
    });
    assert.equal(preview?.imageUrl, "https://cdn.example.com/tw.jpg");
  });

  it("relative image URL resolves against the final fetched URL", () => {
    const preview = buildLinkPreview({
      sourceUrl: "https://example.com/from",
      finalUrl: "https://cdn.example.net/articles/a/",
      html: html(`<meta property="og:image" content="../img/cover.png">`),
    });
    assert.equal(preview?.imageUrl, "https://cdn.example.net/articles/img/cover.png");
  });

  it("missing image remains valid", () => {
    const preview = buildLinkPreview({
      sourceUrl: BASE,
      finalUrl: BASE,
      html: html(`<title>Just a title</title>`),
    });
    assert.ok(preview);
    assert.equal(preview?.imageUrl, undefined);
    assert.equal(preview?.domain, "news.example.com");
    assert.equal(preview?.url, BASE);
  });

  it("strings are truncated and sanitized", () => {
    const long = "a".repeat(LINK_TITLE_MAX_LENGTH + 40);
    const preview = buildLinkPreview({
      sourceUrl: BASE,
      finalUrl: BASE,
      html: html(
        `<meta property="og:title" content="  ${long} <b>x</b> ">`,
      ),
    });
    assert.ok(preview?.title);
    assert.ok(preview.title.length <= LINK_TITLE_MAX_LENGTH);
    assert.equal(preview.title.includes("<b>"), false);
    assert.equal(sanitizeLinkText("  hi\nthere\u0000 ", 20), "hi there");
  });

  it("does not keep javascript or data image URLs", () => {
    const preview = buildLinkPreview({
      sourceUrl: BASE,
      finalUrl: BASE,
      html: html(`
        <meta property="og:image" content="javascript:alert(1)">
        <meta property="og:image:secure_url" content="data:image/gif;base64,xx">
      `),
    });
    assert.equal(preview?.imageUrl, undefined);
  });

  it("extractLinkMetadata reads reversed attribute order", () => {
    const meta = extractLinkMetadata(
      html(`<meta content="Hello" property="og:title">`),
    );
    assert.equal(meta.ogTitle, "Hello");
  });

  it("normalize drops unsafe fields and keeps sparse snapshots", () => {
    const preview = normalizeLinkPreview({
      url: "https://example.com/a",
      domain: "example.com",
      title: "Hello <img src=x>",
      imageUrl: "javascript:alert(1)",
    });
    assert.equal(preview?.url, "https://example.com/a");
    assert.equal(preview?.domain, "example.com");
    assert.equal(preview?.title, "Hello");
    assert.equal(preview?.imageUrl, undefined);
  });
});
