// THE ENROL PATH UNDER TEN SCOPES — the orders/create webhook driven end to
// end, once as ink and once as the Ritualist, against a Shopify that refuses
// what each flavor does not hold.
//
// Why a behavioural test and not a grep: #1019 died on a query that read
// fine. Shopify fails the WHOLE query over one unauthorized selection, so
// "does ink's enrol ask for anything outside its list" is only answerable by
// running the handler with an admin that throws on such a selection and
// watching whether a proof still gets made.
//
// The fake admin answers the enrol-critical query and the two mutations, and
// throws `Access denied` for everything else — which is exactly what the
// Ritualist's product-URL enrichment meets on a store without read_products,
// and what ink would meet on any selection it has no scope for.
//
// The route's own imports (shopify.server, firestore.server) are mocked; the
// enrol call is a fetch stub whose payload the assertions read.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const webhook = vi.fn();
vi.mock("../shopify.server", () => ({ authenticate: { webhook } }));

// A merchant doc under the shop's id — the embed's own shape — with the api
// key the enrol needs and no slice, so today's behaviour applies: activates.
const SHOP = "made-up-shop.myshopify.com";
const merchantDoc = { shop: SHOP, ink_api_key: "ink_live_test_key", verified_delivery_mode: "background" };
const emptySnap = { empty: true, docs: [] as any[] };
const docRef = { id: SHOP, update: vi.fn(), set: vi.fn() };
const fakeFirestore = {
  collection: () => ({
    where: () => ({ limit: () => ({ get: async () => emptySnap }) }),
    doc: () => ({ get: async () => ({ exists: true, data: () => merchantDoc, ref: docRef }), ...docRef }),
  }),
};
vi.mock("../firestore.server", () => ({ default: fakeFirestore }));

const fetchMock = vi.fn();

const ORDER_GID = "gid://shopify/Order/1001";
const webhookBody = {
  id: 1001,
  admin_graphql_api_id: ORDER_GID,
  name: "#1001",
  order_status_url: "https://made-up-shop.myshopify.com/1/orders/abc/authenticate?key=x",
  shipping_address: { phone: "+15550001111", country_code: "US", province_code: "TX" },
  shipping_lines: [],
};

/** What Shopify holds for the order, in both shapes: the Ritualist's query
 *  reads `customer { … }`, ink's reads `email` / `phone` on the Order. */
const orderRecord = {
  id: ORDER_GID,
  name: "#1001",
  email: "dana@example.test",
  phone: "+15550002222",
  customer: { email: "dana@example.test", phone: "+15550002222", firstName: "Dana", lastName: "Ruiz" },
  shippingAddress: { name: "Dana Ruiz", address1: "1 Main St", address2: "", city: "Austin", province: "TX", zip: "78701", country: "United States" },
  totalPriceSet: { shopMoney: { amount: "128.00", currencyCode: "USD" } },
  lineItems: { edges: [{ node: { title: "Lanyard Tote", quantity: 1, sku: "LT-001", originalUnitPriceSet: { shopMoney: { amount: "128.00" } }, image: { url: "https://cdn.test/tote.jpg" } } }] },
  metafield: null,
  fulfillments: [],
};

/** A Shopify that answers only what the query actually selected, and
 *  refuses any selection outside the flavor's scopes — the way the real
 *  one does, for the whole query. */
function fakeAdmin(scopes: readonly string[]) {
  const sent: string[] = [];
  const graphql = vi.fn(async (query: string, _options?: { variables?: Record<string, unknown> }) => {
    sent.push(query);
    const refuse = (field: string, scope: string) => {
      throw new Error(`Access denied for ${field} field. Required access: \`${scope}\` access scope.`);
    };
    if (/query AutoEnrollOrder\b/.test(query)) {
      const selectsCustomer = /\bcustomer\s*\{/.test(query);
      if (selectsCustomer && !scopes.includes("read_customers")) refuse("customer", "read_customers");
      if (/\bproduct\s*\{/.test(query) && !scopes.includes("read_products")) refuse("product", "read_products");
      const { customer, email, phone, ...rest } = orderRecord;
      const order: Record<string, unknown> = { ...rest };
      if (selectsCustomer) order.customer = customer;
      if (/^\s*email\s*$/m.test(query)) order.email = email;
      if (/^\s*phone\s*$/m.test(query)) order.phone = phone;
      return { json: async () => ({ data: { order } }) };
    }
    if (/query AutoEnrollProductUrls\b/.test(query)) {
      if (!scopes.includes("read_products")) refuse("product", "read_products");
      const edges = [{ node: { product: { onlineStoreUrl: "https://made-up-shop.test/products/tote" } } }];
      return { json: async () => ({ data: { order: { lineItems: { edges } } } }) };
    }
    if (/mutation AddOrderTag\b/.test(query)) return { json: async () => ({ data: { tagsAdd: { userErrors: [] } } }) };
    if (/mutation SetInkMetafields\b/.test(query)) return { json: async () => ({ data: { metafieldsSet: { userErrors: [] } } }) };
    throw new Error(`unexpected query: ${query.slice(0, 60)}`);
  });
  return { graphql, sent };
}

function enrollPayload(): any {
  const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/enroll"));
  if (!call) throw new Error("enroll was never called");
  return JSON.parse(String((call[1] as RequestInit).body));
}

beforeEach(() => {
  vi.stubEnv("INK_ADMIN_SECRET", "test-secret");
  vi.stubEnv("INK_API_URL", "https://api.test");
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => JSON.stringify({ proof_id: "proof_1" }),
    json: async () => ({ proof_id: "proof_1" }),
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function run(admin: ReturnType<typeof fakeAdmin>) {
  webhook.mockResolvedValue({ payload: webhookBody, shop: SHOP, admin: { graphql: admin.graphql } });
  const { action } = await import("../routes/webhooks.orders_create");
  const request = new Request("https://app.test/webhooks/orders_create", { method: "POST", body: "{}" });
  return action({ request, params: {}, context: {} } as any);
}

describe("orders/create under APP_FLAVOR=ink", () => {
  beforeEach(() => vi.stubEnv("APP_FLAVOR", "ink"));

  it("enrols the order with ink's ten scopes: no customer{}, no product{}, and a proof is made", async () => {
    const { INK_SCOPES } = await import("./ink-scopes.server");
    const admin = fakeAdmin(INK_SCOPES);

    const res = await run(admin);

    expect(res.status).toBe(200);
    const orderQuery = admin.sent.find((q) => /query AutoEnrollOrder\b/.test(q))!;
    expect(orderQuery).toBeDefined();
    expect(orderQuery).not.toMatch(/\bcustomer\s*\{/);
    expect(orderQuery).not.toMatch(/\bproduct\s*\{/);
    // The buyer's email comes off the Order itself; ink reads no phone at all
    // (it sends no message and shows no number — the minimum-data rule).
    expect(orderQuery).toMatch(/^\s*email\s*$/m);
    expect(orderQuery).not.toMatch(/^\s*phone\s*$/m);

    const payload = enrollPayload();
    expect(payload.order_details.customer_email).toBe("dana@example.test");
    expect(payload.order_details.customer_name).toBe("Dana Ruiz");
    expect(payload.order_details.shipping_address.city).toBe("Austin");
    expect(payload.order_details.order_status_url).toBe(webhookBody.order_status_url);
    // No phone reaches ink's record — not even the webhook body's.
    expect(payload.order_details.customer_phone || null).toBeNull();
    expect(JSON.stringify(payload)).not.toMatch(/555000(1111|2222)/);
    expect(payload.order_details).not.toHaveProperty("customer_phone");
  });

  it("writes no ink.customer_phone metafield — the buyer's phone is not ink's to copy", async () => {
    const { INK_SCOPES } = await import("./ink-scopes.server");
    const admin = fakeAdmin(INK_SCOPES);

    await run(admin);

    const calls = admin.graphql.mock.calls as unknown as [string, { variables?: { metafields?: { key: string }[] } }?][];
    const call = calls.find(([q]) => /mutation SetInkMetafields\b/.test(String(q)));
    expect(call).toBeDefined();
    const keys = (call![1]?.variables?.metafields ?? []).map((m) => m.key);
    expect(keys).toContain("proof_reference");
    expect(keys).not.toContain("customer_phone");
  });

  it("never asks for the product URLs — the enrichment fails open without a doomed call, and the line carries no product_url", async () => {
    const { INK_SCOPES } = await import("./ink-scopes.server");
    const admin = fakeAdmin(INK_SCOPES);

    await run(admin);

    expect(admin.sent.some((q) => /AutoEnrollProductUrls/.test(q))).toBe(false);
    const [line] = enrollPayload().order_details.product_details;
    expect(line.name).toBe("Lanyard Tote");
    expect("product_url" in line).toBe(false);
  });

  it("still tags the order and writes the ink metafields (write_orders is ink's)", async () => {
    const { INK_SCOPES } = await import("./ink-scopes.server");
    const admin = fakeAdmin(INK_SCOPES);

    await run(admin);

    expect(admin.sent.some((q) => /mutation AddOrderTag\b/.test(q))).toBe(true);
    expect(admin.graphql.mock.calls.find(([q]) => /mutation AddOrderTag\b/.test(q))?.[1]?.variables?.tags).toEqual(['Recorded by ink.']);
    expect(admin.sent.some((q) => /mutation SetInkMetafields\b/.test(q))).toBe(true);
  });
  it("retries enrollment without marking an order recorded when the backend returned no proof", async () => {
    const { INK_SCOPES } = await import("./ink-scopes.server");
    const admin = fakeAdmin(INK_SCOPES);
    fetchMock.mockResolvedValue({ok:true,status:200,json:async()=>({}),text:async()=>"{}"});
    expect((await run(admin)).status).toBe(503);
    expect(admin.sent.some(q=>/mutation AddOrderTag|mutation SetInkMetafields/.test(q))).toBe(false);
  });
});

describe("orders/create with APP_FLAVOR unset — the Ritualist, byte-identical", () => {
  beforeEach(() => vi.stubEnv("APP_FLAVOR", ""));

  it("sends the enrol-critical query it has always sent, reads the customer off the Customer object, and asks for the product URLs on their own wire", async () => {
    const { ORDER_DETAIL_QUERY, PRODUCT_URLS_QUERY } = await import("../routes/webhooks.orders_create");
    // The Ritualist holds read_customers; read_products is what its live
    // install lacks — the enrichment must fail open exactly as before.
    const admin = fakeAdmin(["read_orders", "write_orders", "read_customers", "read_fulfillments"]);

    const res = await run(admin);

    expect(res.status).toBe(200);
    expect(admin.sent[0]).toBe(ORDER_DETAIL_QUERY);
    expect(admin.sent).toContain(PRODUCT_URLS_QUERY);
    const payload = enrollPayload();
    expect(payload.order_details.customer_email).toBe("dana@example.test");
    const [line] = payload.order_details.product_details;
    expect("product_url" in line).toBe(false);
  });

  it("carries the product link when read_products is held", async () => {
    const admin = fakeAdmin(["read_orders", "write_orders", "read_customers", "read_products"]);
    await run(admin);
    const [line] = enrollPayload().order_details.product_details;
    expect(line.product_url).toBe("https://made-up-shop.test/products/tote");
  });
});
