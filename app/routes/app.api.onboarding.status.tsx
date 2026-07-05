import { type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import firestore from "../firestore.server";
import { brandSlugFromDomain } from "../services/email.server";
import { fetchBrandEmailKit } from "../services/brand-email.server";
import { getShopIdByDomain, getMerchantTapStats } from "../services/ink-api.server";

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
    let notificationsOn = false;
    let brandSlugOverride: string | undefined;
    try {
      const doc = await firestore.collection("merchants").doc(shop).get();
      const d = doc.exists ? doc.data() ?? {} : {};
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
        brandBuilt = Boolean(kit.logoUrl || kit.heroUrl);
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
