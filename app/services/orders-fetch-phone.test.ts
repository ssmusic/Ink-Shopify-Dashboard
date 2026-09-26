import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const flags = vi.hoisted(() => ({ FEATURE_NFC: false, FEATURE_NOTIFICATIONS: false }));
vi.mock("../flags", () => flags);
vi.mock("./rate-limit.server", () => ({ allowRequest: () => true, clientIp: () => "test", rateLimitResponse: vi.fn() }));
vi.mock("../session-utils.server", () => ({ getOfflineSession: async () => ({ shop: "test-shop.myshopify.com", accessToken: "test-token" }) }));
vi.mock("./token-verify.server", () => ({ verifyProxyToken: async () => ({ shop: "test-shop.myshopify.com" }) }));
const { loader } = await import("../routes/api.orders.fetch");
const customerPhone = "+15550001111";
const shippingPhone = "+15550002222";
let query: string;

beforeEach(() => {
  query = "";
  for (const method of ["log", "warn", "error"] as const) vi.spyOn(console, method).mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
    query = JSON.parse(options.body).query;
    return { json: async () => ({ data: { orders: { edges: [{ node: {
      id: "gid://shopify/Order/1001", name: "#1001", createdAt: "2026-09-01T00:00:00Z",
      tags: ["Recorded by ink."], displayFulfillmentStatus: "FULFILLED",
      totalPriceSet: { shopMoney: { amount: "10", currencyCode: "USD" } },
      customer: { firstName: "Dana", lastName: "Ruiz", email: "dana@example.test", phone: customerPhone },
      shippingAddress: { city: "Austin", phone: shippingPhone },
      lineItems: { edges: [] },
      metafields: { edges: [{ node: { key: "verification_status", value: "enrolled" } }] },
    } }] } } }) };
  }));
});

afterEach(() => {
  flags.FEATURE_NFC = false;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function orders() {
  const response = await loader({ request: new Request("https://app.test/api/orders/fetch?mode=shipments", { headers: { Authorization: "Bearer test" } }), params: {}, context: {} } as any);
  expect(response.status).toBe(200);
  return response.json();
}

describe("order-fetch contact minimization", () => {
  it("does not select or return phones when the hardware lane is disabled, even if the response contains them", async () => {
    const result = await orders();
    expect(result.orders).toHaveLength(1);
    expect(query).not.toMatch(/\bphone\b/);
    expect(result.orders[0]).not.toHaveProperty("customerPhone");
    expect(result.orders[0].shippingAddress).not.toHaveProperty("phone");
    expect(JSON.stringify(result)).not.toContain(customerPhone);
    expect(JSON.stringify(result)).not.toContain(shippingPhone);
  });

  it("preserves the tabled hardware lane's contact fields when enabled", async () => {
    flags.FEATURE_NFC = true;
    const result = await orders();
    expect(query).toMatch(/\bphone\b/);
    expect(result.orders[0].customerPhone).toBe(customerPhone);
    expect(result.orders[0].shippingAddress.phone).toBe(shippingPhone);
  });
});
