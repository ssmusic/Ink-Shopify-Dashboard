// THE CHECKOUT'S DEVICE AND NETWORK, READ AT ENROL — INERT UNTIL SAM SAYS.
//
// Sam, 2026-09-23: "i want to be able to flag a mismatch between the phone
// that ordered the item and the one thats checking" → "i want those things".
//
// WHERE SHOPIFY KEEPS IT (read on shopify.dev, 2026-09-23). The GraphQL Order
// has no `clientDetails` in any version (2025-10 … unstable: "Cannot query
// field "clientDetails" on type "Order". Did you mean "clientIp"?") — only
// `clientIp`. The orders/create webhook BODY, which this app already
// receives, is the REST shape and carries all of it:
//   browser_ip · client_details { accept_language, browser_height,
//   browser_ip, browser_width, session_hash, user_agent }
// So nothing new is queried and no scope moves: the facts are read off the
// body Shopify already sent, and ONLY when this service's
// CHECKOUT_DETAILS_ENABLED is exactly "true".
//
// WHY A SWITCH. The address and the user agent are Shopify protected customer
// data (Level 1 — not one of the four Level 2 fields, so no field checkbox).
// Shopify delivers them to any app with protected-customer-data access; what
// allows ink to USE them is the request's stated purpose and the privacy
// policy. Until the request names this use and Shopify approves it, the switch
// stays unset and this file is never called (SUBMIT-ink-2026-09-23.md,
// "Checkout details").
//
// REDUCED AT ONCE. Nothing raw leaves this function: the address becomes its
// network prefix — the /24 or /48 ink-backend's proxy triage keeps for every
// open (utils/proxyTriage.js ipPrefixOf, mirrored below byte-for-byte) — and
// the user agent becomes the record's device word, a browser and an OS. The
// language header and the window size are kept as Shopify sent them. The
// session hash is dropped: nothing ink records could ever be compared with it.
// `checkout-client.vectors.json` is the backend's file, byte-for-byte: the
// checkout is read here exactly as the backend reads each open.

export type CheckoutClient = {
  ip_prefix?: string;
  device?: string;
  browser?: string;
  os?: string;
  accept_language?: string;
  browser_width?: number;
  browser_height?: number;
};

/** Sam's switch — only the exact word `true` turns it on. */
export function checkoutDetailsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.CHECKOUT_DETAILS_ENABLED === "true";
}

const V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const V6 = /^[0-9a-f:]+$/i;

/** The network prefix of an address — ink-backend utils/proxyTriage.js
 *  ipPrefixOf, line for line: IPv4 → /24, IPv6 → /48, never the address. */
export function ipPrefixOf(address: unknown): string | null {
  let raw = typeof address === "string" ? address.trim() : "";
  if (!raw) return null;
  if (raw.startsWith("::ffff:")) raw = raw.slice(7);
  const v4 = raw.match(V4);
  if (v4) {
    const octets = v4.slice(1, 5).map(Number);
    if (octets.some((o) => o > 255)) return null;
    return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
  }
  if (V6.test(raw) && raw.includes(":")) {
    const head = raw.toLowerCase().split(":").filter(Boolean).slice(0, 3);
    if (head.length < 3) return null;
    return `${head.join(":")}::/48`;
  }
  return null;
}

function uaText(userAgent: unknown): string | null {
  return typeof userAgent === "string" && userAgent.trim() ? userAgent : null;
}

/** The record's device word (the-ritualist order-record-export.ts deviceLabel). */
export function deviceOf(userAgent: unknown): string | null {
  const raw = uaText(userAgent);
  if (!raw) return null;
  const ua = raw.toLowerCase();
  if (ua.includes("ipad")) return "iPad";
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("android")) return "Android";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("macintosh") || ua.includes("mac os x")) return "Mac";
  if (ua.includes("linux")) return "Linux";
  return "Other";
}

/** The browser a user agent names — in-app browsers first (they wear a
 *  platform browser's tokens too), then the ones that wear Chrome's or
 *  Safari's, then Chrome, then Safari. */
export function browserOf(userAgent: unknown): string | null {
  const ua = uaText(userAgent);
  if (!ua) return null;
  if (/\bInstagram\b/.test(ua)) return "Instagram";
  if (/FBAN\/|FBAV\/|FB_IAB/.test(ua)) return "Facebook";
  if (/BytedanceWebview|musical_ly|\bTikTok\b/.test(ua)) return "TikTok";
  if (/SamsungBrowser\//.test(ua)) return "Samsung Internet";
  if (/\bEdg(?:e|A|iOS)?\//.test(ua)) return "Edge";
  if (/\bOPR\/|\bOPiOS\/|\bOpera\b/.test(ua)) return "Opera";
  if (/\bFirefox\/|\bFxiOS\//.test(ua)) return "Firefox";
  if (/\bCriOS\/|\bChrome\//.test(ua)) return "Chrome";
  if (/\bSafari\//.test(ua)) return "Safari";
  return "Other";
}

/** The operating system a user agent names. */
export function osOf(userAgent: unknown): string | null {
  const raw = uaText(userAgent);
  if (!raw) return null;
  const ua = raw.toLowerCase();
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) return "iOS";
  if (ua.includes("android")) return "Android";
  // A word, not a substring: "microsoft" holds c-r-o-s.
  if (/\bcros\b/.test(ua)) return "ChromeOS";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("macintosh") || ua.includes("mac os x")) return "macOS";
  if (ua.includes("linux")) return "Linux";
  return "Other";
}

const ACCEPT_LANGUAGE_MAX = 256;
const ACCEPT_LANGUAGE_RE = /^[A-Za-z0-9\-_,;=.*\s]+$/;
const BROWSER_SIZE_MAX = 20000;

function acceptLanguageOf(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.length <= ACCEPT_LANGUAGE_MAX && ACCEPT_LANGUAGE_RE.test(t) ? t : null;
}

function sizeOf(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= BROWSER_SIZE_MAX ? v : null;
}

/**
 * The checkout's facts off the orders/create body, reduced — or null when
 * Shopify sent none (a draft order, a POS sale, an app-created order).
 * Pure: the caller decides whether the switch lets it be called at all.
 */
export function checkoutClientFromWebhook(body: unknown): CheckoutClient | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const cd =
    b.client_details && typeof b.client_details === "object" && !Array.isArray(b.client_details)
      ? (b.client_details as Record<string, unknown>)
      : {};
  const out: CheckoutClient = {};
  const prefix = ipPrefixOf(cd.browser_ip) ?? ipPrefixOf(b.browser_ip);
  if (prefix) out.ip_prefix = prefix;
  const device = deviceOf(cd.user_agent);
  if (device) out.device = device;
  const browser = browserOf(cd.user_agent);
  if (browser) out.browser = browser;
  const os = osOf(cd.user_agent);
  if (os) out.os = os;
  const language = acceptLanguageOf(cd.accept_language);
  if (language) out.accept_language = language;
  const width = sizeOf(cd.browser_width);
  if (width) out.browser_width = width;
  const height = sizeOf(cd.browser_height);
  if (height) out.browser_height = height;
  return Object.keys(out).length ? out : null;
}
