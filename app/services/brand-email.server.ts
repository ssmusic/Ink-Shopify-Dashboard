// Email-as-tap-page (Sam, 2026-07-02): the delivered email should look like
// the brand's page, not ink's generic band — and carry the SAME aimed
// section the page shows for this buyer.
//
// Everything needed is already public per-brand: the Worker serves the
// brand book (logo, colors, hero media, campaigns) by shop_id. This module
// fetches it fail-soft (any error → null → the email falls back to today's
// neutral template) and runs a server-side port of the page's campaign
// selection (parallelreturns src/lib/campaigns.ts) so the email and the
// page always agree on which aim this buyer sees.

const WORKER_BASE = "https://ink-easypost-proxy.inink.workers.dev";

export interface EmailCampaign {
  id: string;
  headline: string;
  body?: string;
  cta_label?: string;
  cta_url: string;
  code?: string;
  images?: string[];
  tiers?: string[];
  product_match?: string;
  starts_at?: string;
  ends_at?: string;
  enabled?: boolean;
  updated_at?: string;
  created_at?: string;
  geo?: unknown;
}

export interface BrandEmailKit {
  brandName: string | null;
  /** Curated wordmark/logo image (https) — the same asset the tap page header renders. */
  logoUrl: string | null;
  /** Deep brand color for the header band + CTA. */
  ink: string;
  /** Page background tone. */
  paper: string;
  /** The page's own hero media (IG post / published hero) — the email's visual. */
  heroUrl: string | null;
  campaigns: EmailCampaign[];
}

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const pickHex = (v: unknown, fallback: string): string =>
  typeof v === "string" && HEX.test(v.trim()) ? v.trim() : fallback;

const httpsImage = (v: unknown): string | null =>
  typeof v === "string" && /^https:\/\//i.test(v.trim()) && !/\b(1x1|pixel|blank|transparent|spacer)\b/i.test(v)
    ? v.trim()
    : null;

/** Fetch + distill the public brand book. Fail-soft: null on ANY problem —
 *  the caller renders the neutral template and the send never blocks. */
export async function fetchBrandEmailKit(shopId: string): Promise<BrandEmailKit | null> {
  try {
    if (!shopId) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `${WORKER_BASE}/api/public/brand-book?shop_id=${encodeURIComponent(shopId)}`,
      { signal: controller.signal, headers: { "User-Agent": "ink-embed-email" } },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const wrap = (await res.json()) as Record<string, any>;
    const inner = wrap?.brand_book ?? wrap;
    const book = inner?.book ?? inner;
    if (!book || typeof book !== "object") return null;

    const colors = book?.runtime?.parallel_brand_runtime?.design_tokens?.colors ?? {};
    const logo = book?.runtime?.parallel_brand_runtime?.design_tokens?.logo ?? {};
    const igPosts: any[] = Array.isArray(book?.instagram?.posts) ? book.instagram.posts : [];

    return {
      brandName: null, // caller already resolves the display name (From-name precedence)
      // .svg excluded: Gmail refuses SVG images, leaving an empty band.
      logoUrl: /\.svg(\?|$)/i.test(String(logo?.primary_logo_candidate ?? ""))
        ? null
        : httpsImage(logo?.primary_logo_candidate),
      ink: pickHex(colors?.primary, "#111111"),
      paper: pickHex(colors?.surface, "#FAF8F4"),
      heroUrl:
        httpsImage(book?.tap_page?.hero_url) ??
        httpsImage(igPosts.find((p) => p?.display_url && p?.enabled !== false)?.display_url) ??
        httpsImage(book?.imagery?.hero?.[0]?.url) ??
        null,
      campaigns: Array.isArray(book?.campaigns) ? (book.campaigns as EmailCampaign[]) : [],
    };
  } catch {
    return null;
  }
}

// ── Campaign selection — server-side port of src/lib/campaigns.ts ──────
// Same fail-closed semantics: a rule the email can't positively answer
// does NOT match. Geo rules never match here (no coordinates at send
// time), mirroring the page's fail-closed geo behavior for GPS-less taps.

function withinWindow(c: EmailCampaign, now: number): boolean {
  if (c.starts_at && now < Date.parse(c.starts_at)) return false;
  if (c.ends_at && now > Date.parse(c.ends_at)) return false;
  return true;
}

function specificity(c: EmailCampaign): number {
  return (
    (c.tiers && c.tiers.length ? 1 : 0) +
    (c.product_match?.trim() ? 1 : 0) +
    (c.geo ? 1 : 0) +
    (c.starts_at || c.ends_at ? 1 : 0)
  );
}

export function selectEmailCampaign(
  campaigns: EmailCampaign[] | null | undefined,
  buyer: { tier?: string | null; productTitles?: string[] },
): EmailCampaign | null {
  const now = Date.now();
  const titles = (buyer.productTitles ?? []).join(" ").toLowerCase();
  const matched = (campaigns ?? []).filter((c) => {
    if (c.enabled === false) return false;
    if (!c.headline?.trim() || !c.cta_url?.trim()) return false;
    if (!withinWindow(c, now)) return false;
    if (c.tiers && c.tiers.length > 0 && !(buyer.tier && c.tiers.includes(buyer.tier))) return false;
    if (c.product_match?.trim() && !titles.includes(c.product_match.trim().toLowerCase())) return false;
    if (c.geo) return false; // fail closed — no location at send time
    return true;
  });
  if (matched.length === 0) return null;
  return [...matched].sort(
    (a, b) =>
      specificity(b) - specificity(a) ||
      Date.parse(b.updated_at || b.created_at || "") - Date.parse(a.updated_at || a.created_at || ""),
  )[0];
}

/** Stamp email attribution onto a campaign link (mirrors the page's
 *  TrackedLink, medium=email). Never throws; unparseable hrefs pass through. */
export function stampEmailUtm(href: string, campaignId: string): string {
  try {
    const url = new URL(href);
    if (url.searchParams.has("utm_source")) return href;
    url.searchParams.set("utm_source", "ink");
    url.searchParams.set("utm_medium", "email");
    url.searchParams.set("utm_campaign", `campaign:${campaignId}`);
    return url.toString();
  } catch {
    return href;
  }
}
