/**
 * LINK URL validation — public http(s) only; reject internal destinations.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isBlockedIpAddress,
  isBlockedIpv4,
  isBlockedIpv6,
  parsePublicHttpUrl,
} from "@/lib/social/link-url";

describe("LINK URL validation", () => {
  it("accepts valid HTTPS and HTTP", () => {
    const https = parsePublicHttpUrl("https://example.com/path?q=1#hash");
    assert.equal(https.ok, true);
    if (!https.ok) return;
    assert.equal(https.normalized, "https://example.com/path?q=1");
    assert.equal(https.domain, "example.com");

    const http = parsePublicHttpUrl("http://News.Example.COM:80/a");
    assert.equal(http.ok, true);
    if (!http.ok) return;
    assert.equal(http.normalized, "http://news.example.com/a");
  });

  it("rejects malformed URLs", () => {
    assert.equal(parsePublicHttpUrl("").ok, false);
    assert.equal(parsePublicHttpUrl("not a url").ok, false);
    assert.equal(parsePublicHttpUrl("example.com").ok, false);
    assert.equal(parsePublicHttpUrl("https://").ok, false);
  });

  it("rejects non-http schemes", () => {
    assert.equal(parsePublicHttpUrl("javascript:alert(1)").ok, false);
    assert.equal(parsePublicHttpUrl("data:text/html,hi").ok, false);
    assert.equal(parsePublicHttpUrl("file:///etc/passwd").ok, false);
    assert.equal(parsePublicHttpUrl("ftp://example.com/a").ok, false);
  });

  it("rejects localhost and loopback", () => {
    assert.equal(parsePublicHttpUrl("http://localhost/x").error, "blocked");
    assert.equal(parsePublicHttpUrl("http://localhost.localdomain/x").error, "blocked");
    assert.equal(parsePublicHttpUrl("http://127.0.0.1/x").error, "blocked");
    assert.equal(parsePublicHttpUrl("http://127.1/x").error, "blocked");
    assert.equal(parsePublicHttpUrl("http://[::1]/x").error, "blocked");
    assert.equal(parsePublicHttpUrl("http://0.0.0.0/x").error, "blocked");
  });

  it("rejects private IPv4", () => {
    assert.equal(parsePublicHttpUrl("http://10.0.0.8/").error, "blocked");
    assert.equal(parsePublicHttpUrl("http://192.168.1.1/").error, "blocked");
    assert.equal(parsePublicHttpUrl("http://172.16.0.1/").error, "blocked");
    assert.equal(parsePublicHttpUrl("http://169.254.1.1/").error, "blocked");
    assert.equal(isBlockedIpv4("10.1.2.3"), true);
    assert.equal(isBlockedIpv4("8.8.8.8"), false);
  });

  it("rejects IPv6 internal destinations", () => {
    assert.equal(parsePublicHttpUrl("http://[fe80::1]/").error, "blocked");
    assert.equal(parsePublicHttpUrl("http://[fd12:3456:789a::1]/").error, "blocked");
    assert.equal(parsePublicHttpUrl("http://[::ffff:127.0.0.1]/").error, "blocked");
    assert.equal(parsePublicHttpUrl("http://[::ffff:10.0.0.1]/").error, "blocked");
    assert.equal(isBlockedIpv6("::1"), true);
    assert.equal(isBlockedIpv6("fc00::1"), true);
    assert.equal(isBlockedIpAddress("2001:4860:4860::8888"), false);
  });
});
