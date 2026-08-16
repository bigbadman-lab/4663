/**
 * SSRF-safe LINK preview fetch — redirects, blocked destinations, limits.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchLinkPreview } from "@/lib/social/link-preview-server";

function htmlResponse(html: string, headers?: Record<string, string>): Response {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html", ...headers },
  });
}

describe("LINK preview SSRF fetch", () => {
  it("fetches a public HTML page and returns OG metadata", async () => {
    const result = await fetchLinkPreview("https://example.com/story", {
      resolveAddresses: async () => ["93.184.216.34"],
      fetch: async () =>
        htmlResponse(`
          <html><head>
            <meta property="og:title" content="Story">
            <meta property="og:image" content="/cover.jpg">
          </head></html>
        `),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.preview.title, "Story");
    assert.equal(result.preview.imageUrl, "https://example.com/cover.jpg");
    assert.equal(result.preview.domain, "example.com");
  });

  it("rejects a redirect into a prohibited destination", async () => {
    const result = await fetchLinkPreview("https://example.com/go", {
      resolveAddresses: async (hostname) => {
        if (hostname === "example.com") return ["93.184.216.34"];
        return ["127.0.0.1"];
      },
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("example.com")) {
          return new Response(null, {
            status: 302,
            headers: { location: "http://127.0.0.1/secret" },
          });
        }
        return htmlResponse("<html><head><title>nope</title></head></html>");
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "blocked");
  });

  it("rejects when DNS resolves to a private address", async () => {
    const result = await fetchLinkPreview("https://evil.example/x", {
      resolveAddresses: async () => ["10.0.0.4"],
      fetch: async () => htmlResponse("<html></html>"),
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "blocked");
  });

  it("rejects non-HTML responses", async () => {
    const result = await fetchLinkPreview("https://example.com/file.png", {
      resolveAddresses: async () => ["93.184.216.34"],
      fetch: async () =>
        new Response("not html", {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "not_html");
  });

  it("rejects oversized responses", async () => {
    const result = await fetchLinkPreview("https://example.com/huge", {
      resolveAddresses: async () => ["93.184.216.34"],
      maxBytes: 32,
      fetch: async () =>
        htmlResponse(`<html><head><title>${"a".repeat(200)}</title></head></html>`),
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "oversized");
  });

  it("maps abort to timeout", async () => {
    const result = await fetchLinkPreview("https://example.com/slow", {
      resolveAddresses: async () => ["93.184.216.34"],
      timeoutMs: 1,
      now: (() => {
        let n = 0;
        return () => {
          n += 10_000;
          return n;
        };
      })(),
      fetch: async () => htmlResponse("<html></html>"),
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "timeout");
  });

  it("does not forward cookies or expose fetch internals on failure", async () => {
    let headers: Headers | undefined;
    const result = await fetchLinkPreview("https://example.com/x", {
      resolveAddresses: async () => ["93.184.216.34"],
      fetch: async (_input, init) => {
        headers = new Headers(init?.headers);
        throw new Error("ECONNREFUSED 10.0.0.8:443 undici");
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "unavailable");
    assert.equal(headers?.get("cookie"), null);
    assert.equal(headers?.get("authorization"), null);
  });
});
