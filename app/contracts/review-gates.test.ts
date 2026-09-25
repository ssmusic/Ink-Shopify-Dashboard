// The review's three gates (audit 2026-09-25): the Ritualist asks only for
// what it uses, a store with no plan goes to Shopify's plan page, and a
// record charge is a test charge on a development store only.
import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
vi.mock("../shopify.server", () => ({ authenticate: {} }));
import { planGateUrl, gateSkips } from "../services/ritualist-plan-gate.server";
import { recordChargeIsTest } from "../services/record-door.server";

const admin = (answers: unknown[]) => {
  const queue = [...answers];
  return { graphql: vi.fn(async () => ({ json: async () => queue.shift() })) };
};
const NO_PLAN = { data: { currentAppInstallation: { activeSubscriptions: [] } } };
const HANDLE = { data: { currentAppInstallation: { app: { handle: "the-ritualist" } } } };

describe("the Ritualist's scopes", () => {
  it("names none of the unused ones, in the toml or the code", () => {
    for (const f of ["shopify.app.toml", "app/shopify.server.ts"]) {
      const src = readFileSync(f, "utf8");
      for (const s of ["write_themes", "online_store_pages", "metaobjects", "_files", "write_shipping", "assigned_fulfillment_orders", "write_fulfillments"])
        expect(src.match(new RegExp(`"[^"]*${s}`)), `${f} ${s}`).toBeNull();
    }
  });
});

describe("the plan gate", () => {
  it("sends a store Shopify says has no plan to Shopify's plan page", async () => {
    expect(await planGateUrl(admin([NO_PLAN, HANDLE]), "corvara.myshopify.com", "/app/ink")).toBe(
      "https://admin.shopify.com/store/corvara/charges/the-ritualist/pricing_plans",
    );
  });
  it("never gates Billing, a failed read, or a store with a plan", async () => {
    expect(gateSkips("/app/billing")).toBe(true);
    expect(await planGateUrl(admin([NO_PLAN]), "corvara.myshopify.com", "/app/billing")).toBeNull();
    expect(await planGateUrl(admin([{ errors: [{}] }]), "corvara.myshopify.com", "/app")).toBeNull();
  });
});

describe("the record charge's test flag", () => {
  afterEach(() => { delete process.env.RECORD_PURCHASE_TEST; });
  const dev = (v: boolean) => admin([{ data: { shop: { plan: { partnerDevelopment: v } } } }]);
  it("is a test on a development store and real on a live one", async () => {
    expect(await recordChargeIsTest(dev(true))).toBe(true);
    expect(await recordChargeIsTest(dev(false))).toBe(false);
  });
  it("is a test everywhere only when the env forces it", async () => {
    process.env.RECORD_PURCHASE_TEST = "true";
    expect(await recordChargeIsTest(dev(false))).toBe(true);
  });
});
