// THE RITUALIST'S PLAN, RECORDED ON THE BACKEND — never left to chance (Sam,
// 2026-09-24: "fix this - it cant be left to chance").
//
// ink-backend #154: on an ink store, the record is included only while The
// Ritualist is installed AND its plan is active — `ritualist_plan_active_at`
// on the backend merchant (an instant, or null). Only Shopify holds the plan
// (`currentAppInstallation.activeSubscriptions`, readable by every app for
// itself with no scope), so this app writes what Shopify says, from two
// places:
//   · every app open (routes/app.tsx, the Ritualist's provision), at most once
//     per SYNC_EVERY_MS per store and process — a subscribe returns the
//     merchant to the app, so the open right after approval records it;
//   · Shopify's `app_subscriptions/update` webhook
//     (routes/webhooks.app.subscriptions_update.tsx) — a cancel made in
//     Shopify's admin, with the app never opened again, still lands.
// And the Ritualist's uninstall clears it (plan-precedence.server.ts).
//
// Laws: a read that fails decides NOTHING (an unknown never prices or frees a
// record); only a PAID, ACTIVE subscription is a plan (a free plan or none is
// "no plan": the record is priced like any ink store's); the shared doc's
// mirror is written only after the backend took the value, so a refusal is
// asked again on the next open; the instant a plan became active is kept, not
// re-stamped, while it stays active. Never the ink flavor: ink's
// subscriptions are ink's, not the Ritualist's.

import { patchMerchant } from "./ink-api.server";
import { resolveInkShopId } from "./ink-install.server";
import { updateMerchant, type MerchantData } from "./merchant.server";

export const SYNC_EVERY_MS = 10 * 60 * 1000;

export const PAID_PLAN_QUERY = `#graphql
  query RitualistPaidPlan {
    currentAppInstallation {
      activeSubscriptions {
        status
        lineItems {
          plan {
            pricingDetails {
              __typename
              ... on AppRecurringPricing { price { amount } }
              ... on AppUsagePricing { cappedAmount { amount } }
            }
          }
        }
      }
    }
  }
`;

/** Shopify's answer → true (a Ritualist plan is active), false (none), or
 *  null when the body is not Shopify's answer (the read failed: decide
 *  nothing). Any ACTIVE subscription counts, whatever its price: the
 *  Ritualist's plans are all paid (Shopify App Pricing, 2026-09-25), and on a
 *  development store Shopify prices a chosen plan at $0 to test — which is
 *  where Shopify's reviewer tests. A $0 plan is never offered to a live store. */
export function paidPlanActive(body: unknown): boolean | null {
  const subs = (body as { data?: { currentAppInstallation?: { activeSubscriptions?: unknown } } } | null)
    ?.data?.currentAppInstallation?.activeSubscriptions;
  if (!Array.isArray(subs)) return null;
  return subs.some((s) => (s as { status?: unknown })?.status === "ACTIVE");
}

type AdminGraphql = { graphql: (query: string, options?: any) => Promise<{ json: () => Promise<unknown> }> };

export type PlanSyncOutcome = "throttled" | "unknown" | "unchanged" | "no_shop_id" | "recorded" | "failed";

const lastAsked = new Map<string, number>();

/** Ask Shopify whether this store has a paid, active Ritualist plan, and
 *  record it on the backend merchant when it changed. Never throws. */
export async function syncRitualistPlan({
  admin,
  shop,
  existing,
  force = false,
  now = new Date(),
}: {
  admin: AdminGraphql;
  shop: string;
  existing: Partial<MerchantData> | null | undefined;
  /** The webhook: always ask, whatever the throttle says. */
  force?: boolean;
  now?: Date;
}): Promise<PlanSyncOutcome> {
  const t = now.getTime();
  const last = lastAsked.get(shop);
  if (!force && last !== undefined && t - last < SYNC_EVERY_MS) return "throttled";
  lastAsked.set(shop, t);

  let active: boolean | null;
  try {
    const res = await admin.graphql(PAID_PLAN_QUERY);
    active = paidPlanActive(await res.json());
  } catch {
    active = null;
  }
  if (active === null) {
    console.warn(`[plan] ${shop}: Shopify's plan could not be read — nothing recorded, asked again next time.`);
    lastAsked.delete(shop);
    return "unknown";
  }

  const doc = existing ?? {};
  const recorded = doc.ritualist_plan_active_at;
  const everRecorded = recorded !== undefined;
  const wanted = active ? (typeof recorded === "string" && recorded ? recorded : now.toISOString()) : null;
  if (everRecorded && (recorded ?? null) === wanted) return "unchanged";

  const shopId = await resolveInkShopId(shop, doc);
  if (!shopId) {
    console.error(`[plan] ${shop}: no backend merchant known — the Ritualist's plan (${active ? "active" : "none"}) is not recorded.`);
    return "no_shop_id";
  }
  try {
    await patchMerchant(shopId, { ritualist_plan_active_at: wanted });
  } catch (e: any) {
    console.error(`[plan] ${shop} (${shopId}): the backend did not take ritualist_plan_active_at=${wanted}: ${e?.message ?? e} — asked again next open.`);
    lastAsked.delete(shop);
    return "failed";
  }
  await updateMerchant(shop, { ritualist_plan_active_at: wanted });
  console.log(`[plan] ${shop} (${shopId}): the Ritualist's plan is ${active ? `active since ${wanted}` : "not active"} — recorded.`);
  return "recorded";
}
