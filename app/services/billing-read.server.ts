// The one read of "which plan is this store on", for every surface that shows
// it (the billing page, the dashboard's PlanCard, Settings › Cost). NEVER
// throws: a Shopify hiccup costs the plan line, never the page — the "200
// error page" rejection came from exactly one loader that could throw.
import type { ActivePlan } from "./billing-plans";
import { activePlanFrom } from "./billing-plans";
import { BILLING_IS_TEST } from "./billing-mode.server";

type BillingContext = {
  check: (options?: { isTest?: boolean }) => Promise<{ hasActivePayment: boolean; appSubscriptions: unknown[] }>;
};

export async function readActivePlan(billing: BillingContext, label = "[billing]"): Promise<ActivePlan | null> {
  try {
    const result = await billing.check({ isTest: BILLING_IS_TEST });
    return activePlanFrom(result.appSubscriptions as Array<{ id?: string; name?: string; status?: string; test?: boolean }>);
  } catch (err: unknown) {
    console.warn(`${label} plan read failed; rendering without it:`, err instanceof Error ? err.message : err);
    return null;
  }
}
