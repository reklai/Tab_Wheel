// Shared utility functions used across content script modules.

/** HTML-escape a string to prevent XSS in innerHTML assignments */
const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};
const HTML_ESCAPE_RE = /[&<>"']/;
export function escapeHtml(text: string): string {
  if (!HTML_ESCAPE_RE.test(text)) return text;
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPE[character]);
}

/** Escape special regex characters so user input can be used in RegExp safely */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build a case-insensitive fuzzy regex from a space-separated query string */
export function buildFuzzyPattern(query: string): RegExp | null {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return null;
  const pattern = terms
    .map((term) =>
      term
        .split("")
        .map((character) => escapeRegex(character))
        .join("[^]*?"),
    )
    .join("[^]*?");
  try {
    return new RegExp(pattern, "i");
  } catch (_) {
    return null;
  }
}

/** Extract hostname from a URL, with fallback to truncated string */
const DOMAIN_CACHE_MAX = 500;
const domainCache = new Map<string, string>();

function cacheDomain(url: string, value: string): string {
  if (domainCache.size >= DOMAIN_CACHE_MAX) {
    const firstKey = domainCache.keys().next().value;
    if (firstKey !== undefined) domainCache.delete(firstKey);
  }
  domainCache.set(url, value);
  return value;
}

export function extractDomain(url: string): string {
  const cached = domainCache.get(url);
  if (cached) return cached;
  try {
    return cacheDomain(url, new URL(url).hostname);
  } catch (_) {
    return cacheDomain(url, url.length > 30 ? url.substring(0, 30) + "\u2026" : url);
  }
}

const TRACKING_QUERY_PREFIXES = ["utm_"];
const TRACKING_QUERY_KEYS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
]);

/** Normalize URL for duplicate detection/reuse matching across tabs. */
export function normalizeUrlForMatch(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();

    let hostname = parsed.hostname.toLowerCase();
    if (hostname.startsWith("www.")) hostname = hostname.slice(4);

    const isDefaultPort = (protocol === "http:" && parsed.port === "80")
      || (protocol === "https:" && parsed.port === "443");
    const port = parsed.port && !isDefaultPort ? `:${parsed.port}` : "";

    let pathname = parsed.pathname || "/";
    pathname = pathname.replace(/\/{2,}/g, "/");
    if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.slice(0, -1);

    const kept: Array<[string, string]> = [];
    for (const [key, value] of parsed.searchParams.entries()) {
      const lowerKey = key.toLowerCase();
      if (TRACKING_QUERY_KEYS.has(lowerKey)) continue;
      if (TRACKING_QUERY_PREFIXES.some((prefix) => lowerKey.startsWith(prefix))) continue;
      kept.push([key, value]);
    }
    kept.sort((a, b) => {
      const keyCompare = a[0].localeCompare(b[0]);
      if (keyCompare !== 0) return keyCompare;
      return a[1].localeCompare(b[1]);
    });
    const search = kept.length
      ? `?${kept.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}`
      : "";

    return `${protocol}//${hostname}${port}${pathname}${search}`;
  } catch (_) {
    // For non-standard URLs, fallback to trimmed lowercase and strip trailing slash.
    return trimmed.toLowerCase().replace(/\/+$/, "");
  }
}
