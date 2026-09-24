// THE ENROL CARRIES THE CHECKOUT ONLY WHEN SAM SAYS — the orders/create
// webhook driven end to end, with Shopify's client_details on the body.
//
// What this pins:
//   · SWITCH OFF (CHECKOUT_DETAILS_ENABLED unset — today, and until Shopify
//     approves the request that names this use): the enrol payload is
//     byte-identical to the payload of the same order with no client_details
//     at all, under both flavors; no query changes; nothing of it is logged.
//   · SWITCH ON: `checkout_client` rides the enrol, reduced — the prefix, the
//     words, the language, the window size — and the raw address, the user
//     agent and the session hash appear nowhere: not in the payload, not in
//     a log line.
//
// Harness: the one orders-create-under-ink.test.ts uses (the route's imports
// mocked; the enrol call is a fetch stub whose body the assertions read).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const webhook = vi.fn();
vi.mock("../shopify.server", () => ({ authenticate: { webhook } }));

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
const RAW_IP = "203.0.113.7";
const RAW_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const SESSION = "d8f3a1c0ffee";

const baseBody = {
  id: 1001,
  admin_graphql_api_id: ORDER_GID,
  name: "#1001",
  order_status_url: "https://made-up-shop.myshopify.com/1/orders/abc/authenticate?key=x",
  shipping_address: { country_code: "US", province_code: "TX" },
  shipping_lines: [],
};
const withClient = {
  ...baseBody,
  browser_ip: RAW_IP,
  client_details: {
    accept_language: "en-US,en;q=0.9",
    browser_height: 844,
    browser_ip: RAW_IP,
    browser_width: 390,
    session_hash: SESSION,
    user_agent: RAW_UA,
  },
};

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

function fakeAdmin() {
  const sent: string[] = [];
  const graphql = vi.fn(async (query: string) => {
    sent.push(query);
    if (/query AutoEnrollOrder\b/.test(query)) return { json: async () => ({ data: { order: { ...orderRecord } } }) };
    if (/query AutoEnrollProductUrls\b/.test(query)) return { json: async () => ({ data: { order: { lineItems: { edges: [] } } } }) };
    if (/mutation AddOrderTag\b/.test(query)) return { json: async () => ({ data: { tagsAdd: { userErrors: [] } } }) };
    if (/mutation SetInkMetafields\b/.test(query)) return { json: async () => ({ data: { metafieldsSet: { userErrors: [] } } }) };
    throw new Error(`unexpected query: ${query.slice(0, 60)}`);
  });
  return { graphql, sent };
}

const logged: string[] = [];

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
  logged.length = 0;
  const keep = (...args: unknown[]) => {
    logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  vi.spyOn(console, "log").mockImplementation(keep);
  vi.spyOn(console, "warn").mockImplementation(keep);
  vi.spyOn(console, "error").mockImplementation(keep);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Run the webhook once; return the raw enrol body and the queries sent. */
async function enrolWith(payload: object) {
  fetchMock.mockClear();
  const admin = fakeAdmin();
  webhook.mockResolvedValue({ payload, shop: SHOP, admin: { graphql: admin.graphql } });
  const { action } = await import("../routes/webhooks.orders_create");
  const res = await action({ request: new Request("https://app.test/webhooks/orders_create", { method: "POST", body: "{}" }), params: {}, context: {} } as any);
  expect(res.status).toBe(200);
  const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/enroll"));
  if (!call) throw new Error("enroll was never called");
  return { raw: String((call[1] as RequestInit).body), sent: admin.sent };
}

/** The same order, with a fresh nfc token each run — the only moving part. */
const sameButToken = (raw: string) => raw.replace(/"nfc_token":"nfc_[^"]+"/, '"nfc_token":"nfc_X"');

for (const flavor of ["ink", ""] as const) {
  const name = flavor === "ink" ? "ink" : "the Ritualist";

  describe(`switch off — ${name}: the enrol is today's, byte for byte`, () => {
    beforeEach(() => vi.stubEnv("APP_FLAVOR", flavor));

    it("the payload with client_details on the body equals the payload without them", async () => {
      const today = await enrolWith(baseBody);
      const withIt = await enrolWith(withClient);
      expect(sameButToken(withIt.raw)).toBe(sameButToken(today.raw));
      expect(withIt.sent).toEqual(today.sent);
      expect(Object.keys(JSON.parse(withIt.raw))).toEqual(["order_id", "nfc_token", "order_details"]);
    });

    it("nothing of the checkout is read into a log line", async () => {
      await enrolWith(withClient);
      const all = logged.join("\n");
      for (const raw of [RAW_IP, "203.0.113", "Mozilla", SESSION, "checkout"]) expect(all.includes(raw), raw).toBe(false);
    });
  });
}

// NOTHING SAYS VERIFIED DELIVERY (Sam, 2026-09-24: the Ritualist's order tag
// "INK-Verified-Delivery" — "wrong"). Both apps write the one neutral tag at
// enrolment (lib/order-marks.ts, PLACEHOLDER); the Ritualist's old tag is
// read on old orders and never written again.
for (const flavor of ["ink", ""] as const) {
  const name = flavor === "ink" ? "ink" : "the Ritualist";
  it(`${name} tags the order with the neutral tag, never "INK-Verified-Delivery"`, async () => {
    vi.stubEnv("APP_FLAVOR", flavor);
    const { ORDER_TAG } = await import("../lib/order-marks");
    const admin = fakeAdmin();
    webhook.mockResolvedValue({ payload: baseBody, shop: SHOP, admin: { graphql: admin.graphql } });
    const { action } = await import("../routes/webhooks.orders_create");
    const res = await action({ request: new Request("https://app.test/webhooks/orders_create", { method: "POST", body: "{}" }), params: {}, context: {} } as any);
    expect(res.status).toBe(200);
    const tagCall = admin.graphql.mock.calls.find(([q]) => /mutation AddOrderTag\b/.test(String(q))) as unknown as [string, { variables: { tags: string[] } }] | undefined;
    expect(tagCall?.[1]?.variables?.tags).toEqual([ORDER_TAG]);
    expect(JSON.stringify(admin.graphql.mock.calls)).not.toContain("INK-Verified-Delivery");
  });
}

describe("switch on — CHECKOUT_DETAILS_ENABLED=true on this service", () => {
  beforeEach(() => {
    vi.stubEnv("APP_FLAVOR", "ink");
    vi.stubEnv("CHECKOUT_DETAILS_ENABLED", "true");
  });

  it("the enrol carries checkout_client, reduced — and the queries are the same queries", async () => {
    const { raw, sent } = await enrolWith(withClient);
    const payload = JSON.parse(raw);
    expect(payload.checkout_client).toEqual({
      ip_prefix: "203.0.113.0/24",
      ip: RAW_IP,
      user_agent: RAW_UA,
      device: "iPhone",
      browser: "Safari",
      os: "iOS",
      accept_language: "en-US,en;q=0.9",
      browser_width: 390,
      browser_height: 844,
    });
    // Beside the order, never inside it.
    expect("checkout_client" in payload.order_details).toBe(false);
    const { ORDER_DETAIL_QUERY_INK } = await import("../routes/webhooks.orders_create");
    expect(sent[0]).toBe(ORDER_DETAIL_QUERY_INK);
  });

  it("the session hash is nowhere; the address and the agent ride the payload only — never a log line", async () => {
    const { raw } = await enrolWith(withClient);
    for (const secret of [SESSION, "session_hash", "browser_ip"]) expect(raw.includes(secret), secret).toBe(false);
    const logs = logged.join("\n");
    for (const secret of [RAW_IP, "Mozilla", "AppleWebKit", SESSION]) expect(logs.includes(secret), secret).toBe(false);
  });

  it("an order Shopify sent without client details enrols with no checkout_client at all", async () => {
    const { raw } = await enrolWith(baseBody);
    expect("checkout_client" in JSON.parse(raw)).toBe(false);
  });
});
