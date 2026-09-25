// THE PLAN GATE (App Store 1.2.2, audit 2026-09-25). Shopify App Pricing asks
// the app to send a store with no active plan to Shopify's plan page. Billing
// itself stays open (it says where the plan is chosen); a failed read never
// gates — only Shopify saying "no plan" does.
import { readRitualistPlans } from "./ritualist-plan.server";
import { planPageUrl, readAppHandle, RITUALIST_HANDLE } from "../routes/app.billing";

type AdminGraphql = Parameters<typeof readAppHandle>[0];

export function gateSkips(pathname: string): boolean {
  return pathname === "/app/billing" || pathname.startsWith("/app/billing/");
}

export async function planGateUrl(admin: AdminGraphql, shop: string, pathname: string): Promise<string | null> {
  if (gateSkips(pathname)) return null;
  const plans = await readRitualistPlans(admin as any);
  if (plans === null || plans.length > 0) return null;
  const handle = await readAppHandle(admin);
  return planPageUrl(shop, handle ?? RITUALIST_HANDLE);
}
