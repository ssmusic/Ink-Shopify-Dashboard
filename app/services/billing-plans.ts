// THE LOCKED PRICING, as data (Track C, tier billing — HELD).
//
// Sam's lock of 2026-07-05, amended by him 2026-08-23: $299 / $599 / $999 a
// month at 1,000 / 2,500 / 4,000 orders a month. NEVER any other number —
// two stale docs still carry an older Pro price and a per-return line; both
// are dead (memory: the locked pricing and its stale twin).
// Clicks and page opens are free and never metered. Returns are priced
// separately, on the merchant's own carrier account, and are NOT a line
// here. The order caps are what the tier is FOR; nothing meters them yet
// ("the clock is ours, the billing is Shopify's").
//
// Pure: no env, no Shopify. shopify.server.ts turns these into the billing
// config; app.billing.tsx renders them; both are pinned by test to THESE
// numbers so the listing, the Partner Dashboard and the app cannot drift
// apart silently (requirement 1.2.1 — the listing price MUST match).

export interface BillingPlan {
  key: "Starter" | "Growth" | "Pro";
  amount: number;
  currencyCode: "USD";
  ordersPerMonth: number;
}

export const BILLING_PLANS: Record<BillingPlan["key"], BillingPlan> = {
  Starter: { key: "Starter", amount: 299, currencyCode: "USD", ordersPerMonth: 1000 },
  Growth: { key: "Growth", amount: 599, currencyCode: "USD", ordersPerMonth: 2500 },
  Pro: { key: "Pro", amount: 999, currencyCode: "USD", ordersPerMonth: 4000 },
};

export const BILLING_PLAN_KEYS: BillingPlan["key"][] = ["Starter", "Growth", "Pro"];

export function isBillingPlanKey(v: unknown): v is BillingPlan["key"] {
  return typeof v === "string" && (BILLING_PLAN_KEYS as string[]).includes(v);
}

/** "$599/mo" · "2,500 orders a month" — the words every surface uses. */
export function planPriceLine(plan: BillingPlan): string {
  return `$${plan.amount.toLocaleString("en-US")}/mo`;
}
export function planCapLine(plan: BillingPlan): string {
  return `up to ${plan.ordersPerMonth.toLocaleString("en-US")} orders a month`;
}

export interface ActivePlan {
  key: BillingPlan["key"];
  amount: number;
  ordersPerMonth: number;
  /** Shopify's subscription id (gid). */
  subscriptionId: string | null;
  test: boolean;
}

/** The plan Shopify says is ACTIVE for this store, from billing.check()'s
 *  appSubscriptions — or null. Only a subscription NAMED like one of the
 *  three counts; anything else (a legacy charge, a test remnant with
 *  another name) is not a plan we sell. */
export function activePlanFrom(
  subscriptions: Array<{ id?: string; name?: string; status?: string; test?: boolean }> | null | undefined,
): ActivePlan | null {
  for (const sub of subscriptions || []) {
    if (!sub || sub.status !== "ACTIVE") continue;
    const key = sub.name;
    if (!isBillingPlanKey(key)) continue;
    const plan = BILLING_PLANS[key];
    return { key, amount: plan.amount, ordersPerMonth: plan.ordersPerMonth, subscriptionId: sub.id ?? null, test: sub.test === true };
  }
  return null;
}
