// THE RITUALIST'S PLAN, RECORDED — never left to chance (Sam, 2026-09-24:
// "fix this - it cant be left to chance"). ink-backend #154 includes the
// record on an ink store only while the Ritualist is installed AND its plan is
// active (`ritualist_plan_active_at`). Only Shopify knows the plan, so the
// Ritualist writes it: on every app open (throttled), and on Shopify's
// app_subscriptions/update webhook. An unknown never decides; the local mirror
// is written only after the backend took the value, so a refusal is retried.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const patchMerchant = vi.fn();
const getMerchant = vi.fn();
const updateMerchant = vi.fn();
const resolveInkShopId = vi.fn();

vi.mock("./ink-api.server", () => ({ patchMerchant }));
vi.mock("./merchant.server", () => ({ getMerchant, updateMerchant }));
vi.mock("./ink-install.server", () => ({ resolveInkShopId }));

const SHOP = "made-up-shop.myshopify.com";
const NOW = new Date("2026-09-24T23:00:00.000Z");

const recurring = (amount: string, status = "ACTIVE") => ({
  status,
  lineItems: [{ plan: { pricingDetails: { __typename: "AppRecurringPricing", price: { amount, currencyCode: "USD" } } } }],
});
const admin = (subs: unknown[] | null, fail = false) => ({
  graphql: vi.fn(async () => {
    if (fail) throw new Error("shopify down");
    return { json: async () => (subs === null ? { errors: [{ message: "x" }] } : { data: { currentAppInstallation: { activeSubscriptions: subs } } }) };
  }),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  resolveInkShopId.mockResolvedValue("shop_abc123");
  patchMerchant.mockResolvedValue({});
  updateMerchant.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("what counts as an active Ritualist plan", () => {
  it("a paid, active subscription does; a free one, none, or a read that failed does not decide", async () => {
    const { paidPlanActive } = await import("./ritualist-plan-sync.server");
    expect(paidPlanActive({ data: { currentAppInstallation: { activeSubscriptions: [recurring("299.0")] } } })).toBe(true);
    // Pilots are free (2026-09-25): the private $0 Pilot plan counts as a plan.
    expect(paidPlanActive({ data: { currentAppInstallation: { activeSubscriptions: [recurring("0.0")] } } })).toBe(true);
    expect(paidPlanActive({ data: { currentAppInstallation: { activeSubscriptions: [recurring("299.0", "CANCELLED")] } } })).toBe(false);
    expect(paidPlanActive({ data: { currentAppInstallation: { activeSubscriptions: [] } } })).toBe(false);
    expect(paidPlanActive({ errors: [{ message: "x" }] })).toBeNull();
    expect(paidPlanActive(null)).toBeNull();
  });
});

describe("syncRitualistPlan — on every app open, and from the webhook", () => {
  it("an active plan is written to the backend, then mirrored on the shared doc", async () => {
    const { syncRitualistPlan } = await import("./ritualist-plan-sync.server");
    const out = await syncRitualistPlan({ admin: admin([recurring("299.0")]), shop: SHOP, existing: { ink_shop_id: "shop_abc123" } as any, force: true, now: NOW });
    expect(out).toBe("recorded");
    expect(patchMerchant).toHaveBeenCalledWith("shop_abc123", { ritualist_plan_active_at: NOW.toISOString() });
    expect(updateMerchant).toHaveBeenCalledWith(SHOP, { ritualist_plan_active_at: NOW.toISOString() });
    expect(patchMerchant.mock.invocationCallOrder[0]).toBeLessThan(updateMerchant.mock.invocationCallOrder[0]);
  });

  it("a plan that ends is cleared; an unchanged one costs no write", async () => {
    const { syncRitualistPlan } = await import("./ritualist-plan-sync.server");
    expect(await syncRitualistPlan({ admin: admin([]), shop: SHOP, existing: { ritualist_plan_active_at: "2026-09-01T00:00:00.000Z" } as any, force: true, now: NOW })).toBe("recorded");
    expect(patchMerchant).toHaveBeenCalledWith("shop_abc123", { ritualist_plan_active_at: null });

    patchMerchant.mockClear();
    const kept = "2026-09-01T00:00:00.000Z";
    expect(await syncRitualistPlan({ admin: admin([recurring("299.0")]), shop: SHOP, existing: { ritualist_plan_active_at: kept } as any, force: true, now: NOW })).toBe("unchanged");
    expect(await syncRitualistPlan({ admin: admin([]), shop: SHOP, existing: { ritualist_plan_active_at: null } as any, force: true, now: NOW })).toBe("unchanged");
    expect(patchMerchant).not.toHaveBeenCalled();
  });

  it("a doc that never recorded the plan records 'none' once, so the backend is never left guessing", async () => {
    const { syncRitualistPlan } = await import("./ritualist-plan-sync.server");
    expect(await syncRitualistPlan({ admin: admin([]), shop: SHOP, existing: {} as any, force: true, now: NOW })).toBe("recorded");
    expect(patchMerchant).toHaveBeenCalledWith("shop_abc123", { ritualist_plan_active_at: null });
  });

  it("Shopify's read failing decides nothing and writes nothing", async () => {
    const { syncRitualistPlan } = await import("./ritualist-plan-sync.server");
    for (const a of [admin(null), admin([], true)]) {
      expect(await syncRitualistPlan({ admin: a, shop: SHOP, existing: { ritualist_plan_active_at: "2026-09-01T00:00:00.000Z" } as any, force: true, now: NOW })).toBe("unknown");
    }
    expect(patchMerchant).not.toHaveBeenCalled();
    expect(updateMerchant).not.toHaveBeenCalled();
  });

  it("a backend refusal leaves the mirror alone, so the next open asks again", async () => {
    const { syncRitualistPlan } = await import("./ritualist-plan-sync.server");
    patchMerchant.mockRejectedValue(new Error("400"));
    expect(await syncRitualistPlan({ admin: admin([recurring("299.0")]), shop: SHOP, existing: {} as any, force: true, now: NOW })).toBe("failed");
    expect(updateMerchant).not.toHaveBeenCalled();
  });

  it("no backend merchant known → nothing written", async () => {
    const { syncRitualistPlan } = await import("./ritualist-plan-sync.server");
    resolveInkShopId.mockResolvedValue("");
    expect(await syncRitualistPlan({ admin: admin([recurring("299.0")]), shop: SHOP, existing: {} as any, force: true, now: NOW })).toBe("no_shop_id");
    expect(patchMerchant).not.toHaveBeenCalled();
  });

  it("an app open asks Shopify at most once per ten minutes per store; the webhook always asks", async () => {
    const { syncRitualistPlan, SYNC_EVERY_MS } = await import("./ritualist-plan-sync.server");
    const a = admin([]);
    const shop = "throttle-shop.myshopify.com";
    const existing = { ritualist_plan_active_at: null } as any;
    await syncRitualistPlan({ admin: a, shop, existing, now: NOW });
    expect(await syncRitualistPlan({ admin: a, shop, existing, now: new Date(NOW.getTime() + 60_000) })).toBe("throttled");
    expect(a.graphql).toHaveBeenCalledTimes(1);
    await syncRitualistPlan({ admin: a, shop, existing, force: true, now: new Date(NOW.getTime() + 60_000) });
    expect(a.graphql).toHaveBeenCalledTimes(2);
    await syncRitualistPlan({ admin: a, shop, existing, now: new Date(NOW.getTime() + 60_000 + SYNC_EVERY_MS + 1) });
    expect(a.graphql).toHaveBeenCalledTimes(3);
  });
});
