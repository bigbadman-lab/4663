/**
 * Public http(s) URL validation + normalization for LINK objects.
 * Hostname-only checks live here; DNS / redirect re-validation is server-side.
 */

export const LINK_URL_MAX_LENGTH = 2048 as const;

export type LinkUrlError = "invalid_url" | "blocked";

export type ValidatePublicHttpUrlResult =
  | { ok: true; url: URL; normalized: string; domain: string }
  | { ok: false; error: LinkUrlError };

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".private",
  ".lan",
  ".home",
  ".corp",
  ".localdomain",
] as const;

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.",
  "metadata.google.internal",
  "metadata.google.internal.",
]);

export function isBlockedIpv4(address: string): boolean {
  const octets = parseIpv4Octets(address);
  if (!octets) return false;
  const ip = ipv4ToInt(octets);

  return (
    ipv4InCidr(ip, "0.0.0.0", 8) ||
    ipv4InCidr(ip, "10.0.0.0", 8) ||
    ipv4InCidr(ip, "100.64.0.0", 10) ||
    ipv4InCidr(ip, "127.0.0.0", 8) ||
    ipv4InCidr(ip, "169.254.0.0", 16) ||
    ipv4InCidr(ip, "172.16.0.0", 12) ||
    ipv4InCidr(ip, "192.0.0.0", 24) ||
    ipv4InCidr(ip, "192.0.2.0", 24) ||
    ipv4InCidr(ip, "192.168.0.0", 16) ||
    ipv4InCidr(ip, "198.18.0.0", 15) ||
    ipv4InCidr(ip, "198.51.100.0", 24) ||
    ipv4InCidr(ip, "203.0.113.0", 24) ||
    ipv4InCidr(ip, "224.0.0.0", 4) ||
    ipv4InCidr(ip, "240.0.0.0", 4)
  );
}

export function isBlockedIpv6(address: string): boolean {
  const groups = expandIpv6(address);
  if (!groups) return true;

  const mapped = mappedIpv4FromIpv6(groups);
  if (mapped) return isBlockedIpv4(mapped);

  if (groups.every((g) => g === 0)) return true;
  if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 &&
      groups[4] === 0 && groups[5] === 0 && groups[6] === 0 && groups[7] === 1) {
    return true;
  }

  // fe80::/10 link-local
  if ((groups[0] & 0xffc0) === 0xfe80) return true;
  // fc00::/7 unique local
  if ((groups[0] & 0xfe00) === 0xfc00) return true;
  // ff00::/8 multicast
  if ((groups[0] & 0xff00) === 0xff00) return true;
  // 2001:db8::/32 documentation
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true;

  return false;
}

export function isBlockedIpAddress(address: string): boolean {
  const trimmed = address.trim().toLowerCase();
  if (trimmed.includes(":")) return isBlockedIpv6(trimIpv6Zone(trimmed));
  return isBlockedIpv4(trimmed);
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (BLOCKED_HOSTS.has(host) || BLOCKED_HOSTS.has(`${host}.`)) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  for (const suffix of BLOCKED_HOST_SUFFIXES) {
    if (host === suffix.slice(1) || host.endsWith(suffix)) return true;
  }
  if (/^\d+$/.test(host)) return true;
  if (/^\d+(\.\d+){1,3}$/.test(host)) {
    if (!parseIpv4Octets(host) || isBlockedIpv4(host)) return true;
  }
  if (isBlockedIpAddress(host)) return true;
  return false;
}

export function parsePublicHttpUrl(raw: unknown): ValidatePublicHttpUrlResult {
  if (typeof raw !== "string") {
    return { ok: false, error: "invalid_url" };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > LINK_URL_MAX_LENGTH) {
    return { ok: false, error: "invalid_url" };
  }
  if (/\s/.test(trimmed)) {
    return { ok: false, error: "invalid_url" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "invalid_url" };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "invalid_url" };
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return { ok: false, error: "blocked" };
  }
  if (!parsed.hostname) {
    return { ok: false, error: "invalid_url" };
  }
  if (parsed.hostname.toLowerCase() === "0.0.0.0") {
    return { ok: false, error: "blocked" };
  }
  if (isBlockedHostname(parsed.hostname)) {
    return { ok: false, error: "blocked" };
  }

  const normalized = normalizePublicHttpUrl(parsed);
  const domain = publicUrlDomain(parsed);
  return { ok: true, url: parsed, normalized, domain };
}

export function normalizePublicHttpUrl(url: URL): string {
  const copy = new URL(url.href);
  copy.hash = "";
  copy.hostname = copy.hostname.toLowerCase();
  if (
    (copy.protocol === "https:" && copy.port === "443") ||
    (copy.protocol === "http:" && copy.port === "80")
  ) {
    copy.port = "";
  }
  return copy.href;
}

export function publicUrlDomain(url: URL): string {
  return url.hostname.replace(/\.$/, "").toLowerCase();
}

export function resolveUrlAgainst(base: string, maybeRelative: string): URL | null {
  try {
    return new URL(maybeRelative.trim(), base);
  } catch {
    return null;
  }
}

function parseIpv4Octets(value: string): [number, number, number, number] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    if (part.length > 1 && part.startsWith("0")) return null;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    octets.push(n);
  }
  return octets as [number, number, number, number];
}

function ipv4ToInt(octets: [number, number, number, number]): number {
  return (
    ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0
  );
}

function ipv4InCidr(ip: number, prefix: string, bits: number): boolean {
  const octets = parseIpv4Octets(prefix);
  if (!octets) return false;
  const base = ipv4ToInt(octets);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (base & mask);
}

function trimIpv6Zone(address: string): string {
  const zone = address.indexOf("%");
  return zone === -1 ? address : address.slice(0, zone);
}

function expandIpv6(address: string): number[] | null {
  let raw = address.trim().toLowerCase();
  if (raw.startsWith("[") && raw.endsWith("]")) {
    raw = raw.slice(1, -1);
  }
  raw = trimIpv6Zone(raw);
  if (!raw.includes(":")) return null;

  let v4Tail: [number, number, number, number] | null = null;
  const lastColon = raw.lastIndexOf(":");
  if (raw.includes(".")) {
    v4Tail = parseIpv4Octets(raw.slice(lastColon + 1));
    if (!v4Tail) return null;
    raw = raw.slice(0, lastColon);
  }

  if (raw.includes(":::")) return null;
  const halves = raw.split("::");
  if (halves.length > 2) return null;

  const parseGroups = (side: string): number[] | null => {
    if (side === "") return [];
    const parts = side.split(":");
    const groups: number[] = [];
    for (const part of parts) {
      if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
      groups.push(Number.parseInt(part, 16));
    }
    return groups;
  };

  let groups: number[];
  if (halves.length === 1) {
    const parsed = parseGroups(halves[0]);
    if (!parsed) return null;
    groups = parsed;
  } else {
    const left = parseGroups(halves[0]);
    const right = parseGroups(halves[1]);
    if (!left || !right) return null;
    const missing = 8 - left.length - right.length - (v4Tail ? 2 : 0);
    if (missing < 0) return null;
    groups = [...left, ...Array(missing).fill(0), ...right];
  }

  if (v4Tail) {
    groups.push((v4Tail[0] << 8) | v4Tail[1], (v4Tail[2] << 8) | v4Tail[3]);
  }
  if (groups.length !== 8) return null;
  return groups;
}

function mappedIpv4FromIpv6(groups: number[]): string | null {
  const isMapped =
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff;
  if (!isMapped) return null;
  const a = (groups[6] >> 8) & 0xff;
  const b = groups[6] & 0xff;
  const c = (groups[7] >> 8) & 0xff;
  const d = groups[7] & 0xff;
  return `${a}.${b}.${c}.${d}`;
}
