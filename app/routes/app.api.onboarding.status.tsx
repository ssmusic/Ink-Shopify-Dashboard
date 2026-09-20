import { type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import firestore from "../firestore.server";
import { brandSlugFromDomain } from "../services/email.server";
import { fetchBrandEmailKit } from "../services/brand-email.server";
import { getShopIdByDomain, getMerchantTapStats } from "../services/ink-api.server";
import { findMerchantDocRef } from "../services/merchant-doc.server";

const json = (data: any, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

export interface OnboardingStatus {
  brandBuilt: boolean;
  brand: {
    name: string | null;
    logoUrl: string | null;
    heroUrl: string | null;
    ink: string;
    paper: string;
  } | null;
  previewUrl: string; // {brand}.in.ink
  notificationsOn: boolean;
  ordersEnrolled: number;
  deliveries: number;
  opens: number;
}

// GET /app/api/onboarding/status — the first-run setup state, all REAL:
// does a brand page exist yet (worker brand book), are notifications on
// (merchant doc), have any orders enrolled/delivered/opened (proof stats).
// Powers the in-admin OnboardingChecklist + BrandPreviewCard. Fail-soft:
// every failure degrades to "not done yet", never throws the dashboard.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    // Merchant doc: notifications + optional brand_slug override.
    //
    // findMerchantDocRef, not doc(shop) alone: the doc-id-only read missed a
    // store's real notification_settings whenever it lived on the other of
    // the two possible merchant docs (§17.2 landmine) — the checklist would
    // say "not done yet" for a merchant who had already turned them on.
    let notificationsOn = false;
    let brandSlugOverride: string | undefined;
    try {
      const hit = await findMerchantDocRef(firestore, shop);
      const d = hit?.data ?? {};
      const ch = d.notification_settings?.channels;
      notificationsOn = Boolean(ch?.email || ch?.sms);
      if (typeof d.brand_slug === "string" && d.brand_slug) brandSlugOverride = d.brand_slug;
    } catch { /* default false */ }

    const slug = brandSlugFromDomain(brandSlugOverride || shop);
    const previewUrl = slug ? `https://${slug}.in.ink` : "https://www.in.ink";

    // Brand book (worker) + proof stats (backend) — independent, fail-soft each.
    let brand: OnboardingStatus["brand"] = null;
    let brandBuilt = false;
    let ordersEnrolled = 0;
    let deliveries = 0;
    let opens = 0;

    try {
      const shopId = await getShopIdByDomain(shop);
      const [kit, stats] = await Promise.all([
        fetchBrandEmailKit(shopId).catch(() => null),
        getMerchantTapStats(shop).catch(() => null),
      ]);
      if (kit) {
        brand = {
          name: kit.brandName,
          logoUrl: kit.logoUrl,
          heroUrl: kit.heroUrl,
          ink: kit.ink,
          paper: kit.paper,
        };
        // "Built" = the book has real brand media (logo or hero), not just a
        // provisioned shell.
        // "BUILD YOUR PAGE" IS ANSWERED BY A PAGE, NOT BY PICTURES.
        //
        // This read `Boolean(kit.logoUrl || kit.heroUrl)`, which asks whether
        // the brand has imagery. Those are different questions, and they came
        // apart on the first real Shopify install to reach this screen
        // (Corvara Cicli, 2026-08-20):
        //
        //   book.tap_page                      present — the page renders
        //   runtime…logo.primary_logo_candidate ""     — the logo the kit reads
        //   tokens.logo.primary_url            set     — where the logo IS
        //   tap_page.hero_url                  null    — EMPTY BY DESIGN: a
        //     non-Instagram page leaves the hero to the live order's product
        //   instagram.posts                    0       — no Instagram
        //
        // So a merchant with a working page was told "Your page — not built
        // yet" and handed a button to go build one. For a store behind a
        // storefront password that button is a dead end, which is the exact
        // shape of the 2.1.1 rejection.
        //
        // A page exists when the book carries one. Imagery still counts —
        // a brand mid-build with a logo and no page has started — but it is
        // no longer the only way to answer yes.
        brandBuilt = Boolean(kit.hasPage || kit.logoUrl || kit.heroUrl);
      }
      if (stats) {
        ordersEnrolled = stats.enrollments ?? 0;
        deliveries = stats.delivered ?? 0;
        opens = stats.engaged ?? 0;
      }
    } catch { /* brand not built / merchant not resolvable yet */ }

    const status: OnboardingStatus = {
      brandBuilt,
      brand,
      previewUrl,
      notificationsOn,
      ordersEnrolled,
      deliveries,
      opens,
    };
    return json(status);
  } catch (err: any) {
    if (err instanceof Response) throw err;
    console.error("[onboarding/status] error:", err?.message || err);
    return json({
      brandBuilt: false,
      brand: null,
      previewUrl: "https://www.in.ink",
      notificationsOn: false,
      ordersEnrolled: 0,
      deliveries: 0,
      opens: 0,
    } satisfies OnboardingStatus);
  }
};
