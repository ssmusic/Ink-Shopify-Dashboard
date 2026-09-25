// A TEST STORE, SAID BY SHOPIFY (test-store-sync.server.ts; ink-backend #162).
// Both apps ask Shopify on every open whether the store is a development
// store and stamp the answer on the backend merchant. An unknown never
// decides; the mirror is written only after the backend took the value; an
// operator's stamp stands.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const patchMerchant = vi.fn();
const updateMerchant = vi.fn();
const resolveInkShopId = vi.fn();

vi.mock("./ink-api.server", () => ({ patchMerchant }));
vi.mock("./merchant.server", () => ({ updateMerchant }));
vi.mock("./ink-install.server", () => ({ resolveInkShopId }));

const NOW = new Date("2026-09-25T03:00:00.000Z");
let n = 0;
const shop = () => `made-up-shop-${(n += 1)}.myshopify.com`;
const admin = (partnerDevelopment: unknown, fail = false) => ({
  graphql: vi.fn(async () => {
    if (fail) throw new Error("shopify down");
    return { json: async () => (partnerDevelopment === undefined ? { errors: [{ message: "x" }] } : { data: { shop: { plan: { partnerDevelopment } } } }) };
  }),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  resolveInkShopId.mockResolvedValue("shop_abc123");
  updateMerchant.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("Shopify's answer", () => {
  it("a boolean decides; anything else is no answer", async () => {
    const { partnerDevelopmentOf } = await import("./test-store-sync.server");
    expect(partnerDevelopmentOf({ data: { shop: { plan: { partnerDevelopment: true } } } })).toBe(true);
    expect(partnerDevelopmentOf({ data: { shop: { plan: { partnerDevelopment: false } } } })).toBe(false);
    expect(partnerDevelopmentOf({ data: { shop: { plan: { partnerDevelopment: "true" } } } })).toBeNull();
    expect(partnerDevelopmentOf({ errors: [{ message: "x" }] })).toBeNull();
    expect(partnerDevelopmentOf(null)).toBeNull();
  });
});

describe("syncTestStore — on every open, both apps", () => {
  it("a development store is stamped on the backend with Shopify as the source, then mirrored", async () => {
    const { syncTestStore } = await import("./test-store-sync.server");
    patchMerchant.mockResolvedValue({ test_store: true, test_store_source: "shopify" });
    const s = shop();
    expect(await syncTestStore({ admin: admin(true), shop: s, existing: { shop: s }, now: NOW })).toBe("recorded");
    expect(patchMerchant).toHaveBeenCalledWith("shop_abc123", { test_store: true, test_store_source: "shopify" });
    expect(updateMerchant).toHaveBeenCalledWith(s, { test_store: true });
  });

  it("a live store is recorded as live", async () => {
    const { syncTestStore } = await import("./test-store-sync.server");
    patchMerchant.mockResolvedValue({ test_store: false, test_store_source: "shopify" });
    const s = shop();
    expect(await syncTestStore({ admin: admin(false), shop: s, existing: { shop: s }, now: NOW })).toBe("recorded");
    expect(patchMerchant).toHaveBeenCalledWith("shop_abc123", { test_store: false, test_store_source: "shopify" });
  });

  it("an unchanged answer writes nothing; a second open inside ten minutes asks nothing", async () => {
    const { syncTestStore } = await import("./test-store-sync.server");
    const s = shop();
    expect(await syncTestStore({ admin: admin(true), shop: s, existing: { shop: s, test_store: true }, now: NOW })).toBe("unchanged");
    const again = admin(false);
    expect(await syncTestStore({ admin: again, shop: s, existing: { shop: s, test_store: true }, now: new Date(NOW.getTime() + 60_000) })).toBe("throttled");
    expect(again.graphql).not.toHaveBeenCalled();
    expect(patchMerchant).not.toHaveBeenCalled();
  });

  it("a read that fails decides nothing and is asked again on the next open", async () => {
    const { syncTestStore } = await import("./test-store-sync.server");
    const s = shop();
    expect(await syncTestStore({ admin: admin(true, true), shop: s, existing: { shop: s }, now: NOW })).toBe("unknown");
    expect(await syncTestStore({ admin: admin(undefined), shop: s, existing: { shop: s }, now: NOW })).toBe("unknown");
    expect(patchMerchant).not.toHaveBeenCalled();
    patchMerchant.mockResolvedValue({ test_store: true, test_store_source: "shopify" });
    expect(await syncTestStore({ admin: admin(true), shop: s, existing: { shop: s }, now: NOW })).toBe("recorded");
  });

  it("a backend refusal leaves the mirror alone and is asked again", async () => {
    const { syncTestStore } = await import("./test-store-sync.server");
    const s = shop();
    patchMerchant.mockRejectedValueOnce(new Error("500"));
    expect(await syncTestStore({ admin: admin(true), shop: s, existing: { shop: s }, now: NOW })).toBe("failed");
    expect(updateMerchant).not.toHaveBeenCalled();
    patchMerchant.mockResolvedValue({ test_store: true, test_store_source: "shopify" });
    expect(await syncTestStore({ admin: admin(true), shop: s, existing: { shop: s }, now: NOW })).toBe("recorded");
  });

  it("an operator's test stamp stands against Shopify's 'live'", async () => {
    const { syncTestStore } = await import("./test-store-sync.server");
    const s = shop();
    patchMerchant.mockResolvedValue({ test_store: true, test_store_source: "operator" });
    expect(await syncTestStore({ admin: admin(false), shop: s, existing: { shop: s }, now: NOW })).toBe("kept");
    expect(updateMerchant).toHaveBeenCalledWith(s, { test_store: true });
  });

  it("no backend merchant yet: nothing recorded, asked again", async () => {
    const { syncTestStore } = await import("./test-store-sync.server");
    const s = shop();
    resolveInkShopId.mockResolvedValue("");
    expect(await syncTestStore({ admin: admin(true), shop: s, existing: { shop: s }, now: NOW })).toBe("no_shop_id");
    expect(patchMerchant).not.toHaveBeenCalled();
  });
});
