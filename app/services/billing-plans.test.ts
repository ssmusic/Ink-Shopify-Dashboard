// The locked pricing, pinned (Track C, tier billing — HELD). $299 / $599 /
// $999 at 1,000 / 2,500 / 4,000 — never any other number, on any surface;
// the plan shown is always the one Shopify says is ACTIVE; and the 2.1.1
// fixes on the billing route stay in place.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BILLING_PLANS, BILLING_PLAN_KEYS, activePlanFrom, isBillingPlanKey, planCapLine, planPriceLine } from "./billing-plans";

function src(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("the three locked tiers", () => {
  it("are exactly $299 / $599 / $999 at 1,000 / 2,500 / 4,000 orders, USD, in that order", () => {
    expect(BILLING_PLAN_KEYS).toEqual(["Starter", "Growth", "Pro"]);
    expect(BILLING_PLANS.Starter).toEqual({ key: "Starter", amount: 299, currencyCode: "USD", ordersPerMonth: 1000 });
    expect(BILLING_PLANS.Growth).toEqual({ key: "Growth", amount: 599, currencyCode: "USD", ordersPerMonth: 2500 });
    expect(BILLING_PLANS.Pro).toEqual({ key: "Pro", amount: 999, currencyCode: "USD", ordersPerMonth: 4000 });
    expect(planPriceLine(BILLING_PLANS.Growth)).toBe("$599/mo");
    expect(planCapLine(BILLING_PLANS.Growth)).toBe("up to 2,500 orders a month");
  });

  it("the dead numbers never appear on any billing surface", () => {
    const surfaces = [
      src("./billing-plans.ts"),
      src("../shopify.server.ts"),
      src("../routes/app.billing.tsx"),
      src("../components/billing/PlanCard.tsx"),
      src("../components/settings/AccountSettings.tsx"),
    ].join("\n");
    for (const dead of ["1,299", "1299", "$2.50", "2.50 per", "$2.00 per", "$0.05", "$49", "Stripe", "stripe"]) {
      expect(surfaces).not.toContain(dead);
    }
  });

  it("shopify.server.ts declares the three plans from the locked data, every 30 days, and nothing else", () => {
    const s = src("../shopify.server.ts");
    const block = s.slice(s.indexOf("billing: {"), s.indexOf("...(process.env.SHOP_CUSTOM_DOMAIN"));
    for (const key of BILLING_PLAN_KEYS) {
      expect(block).toContain(`${key}: {`);
      expect(block).toContain(`BILLING_PLANS.${key}.amount`);
    }
    expect((block.match(/BillingInterval\.Every30Days/g) || []).length).toBe(3);
    expect(block).not.toMatch(/amount:\s*\d/);
    expect(block).not.toContain("Usage");
    expect(block).not.toContain("trialDays");
  });
});

describe("activePlanFrom", () => {
  it("picks the ACTIVE subscription named like a plan; ignores the rest", () => {
    expect(activePlanFrom([
      { id: "gid://shopify/AppSubscription/1", name: "Growth", status: "CANCELLED" },
      { id: "gid://shopify/AppSubscription/2", name: "Pro", status: "ACTIVE", test: true },
    ])).toEqual({ key: "Pro", amount: 999, ordersPerMonth: 4000, subscriptionId: "gid://shopify/AppSubscription/2", test: true });
    expect(activePlanFrom([{ name: "Legacy $49", status: "ACTIVE" }])).toBeNull();
    expect(activePlanFrom([])).toBeNull();
    expect(activePlanFrom(null)).toBeNull();
    expect(isBillingPlanKey("Starter")).toBe(true);
    expect(isBillingPlanKey("starter")).toBe(false);
  });
});

describe("the billing route keeps the 2.1.1 fixes and never charges on its own", () => {
  it("every billing-touching route keeps Shopify's boundary and headers", () => {
    for (const rel of ["../routes/app.billing.tsx", "../routes/app.settings.tsx", "../routes/app.dashboard.tsx"]) {
      const s = src(rel);
      expect(s).toContain("boundary.error(useRouteError())");
      expect(s).toContain("boundary.headers(args)");
    }
  });

  it("a plan starts only from the merchant's own Choose: billing.request lives in the action, behind a plan-key check, with isTest from the env and a returnUrl back here", () => {
    const s = src("../routes/app.billing.tsx");
    const action = s.slice(s.indexOf("export async function action"), s.indexOf("export default function"));
    expect(action).toContain("isBillingPlanKey(plan)");
    expect(action).toContain("billing.request({");
    expect(action).toContain("isTest: BILLING_IS_TEST");
    expect(action).toContain("returnUrl: `${appUrl}/app/billing`");
    const loader = s.slice(s.indexOf("export async function loader"), s.indexOf("export async function action"));
    expect(loader).not.toContain("billing.request");
    expect(loader).not.toContain("billing.require");
    expect(src("../routes/app.tsx")).not.toContain("billing.request");
    expect(src("../services/billing-mode.server.ts")).toContain('process.env.SHOPIFY_BILLING_TEST === "true"');
  });

  it("the plan every surface shows is READ from Shopify through one never-throwing read", () => {
    const read = src("../services/billing-read.server.ts");
    expect(read).toContain("billing.check({ isTest: BILLING_IS_TEST })");
    expect(read).toContain("return null;");
    for (const rel of ["../routes/app.billing.tsx", "../routes/app.settings.tsx", "../routes/app.dashboard.tsx"]) {
      expect(src(rel)).toContain("readActivePlan(billing");
    }
    expect(src("../components/billing/PlanCard.tsx")).not.toMatch(/\$\d/);
  });
});
