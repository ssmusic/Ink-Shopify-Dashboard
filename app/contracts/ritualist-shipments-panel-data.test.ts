// WHAT THE RITUALIST'S SHIPMENTS ROW READS, AND THE DOOR ITS RECORD ASKS.
//
//   · The Shipments loader hands each ink order its panel — the record, the
//     timeline and the Ritualist's door (services/ritualist-rows.server.ts) —
//     read with the merchant's own key, by the proof id asked for by key.
//   · The panel says "Recipient": the ship-to's own name, and the order's own
//     email; the list's Customer column keeps the buyer.
//   · No timer re-reads every row's record twice a minute.
//   · /app/record answers the included record's inspection and files on the
//     Ritualist through the same function ink's Records library uses, with the
//     Ritualist's key; a purchase never takes that path; ink's door is as it was.
// Made-up shop, orders and keys: this repository is public.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PROOF = "proof_000000000000000000a10420";
const RECORD = { summary: { opens: 1 }, elements: [], locked: false, whole: true, forSale: null };
const TIMELINE = { steps: [], address: null, opens: [], window: null };

vi.mock("../firestore.server", () => ({ default: {}, firestore: {}, app: {} }));
vi.mock("../shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("../services/merchant.server", () => ({ getMerchant: vi.fn(), updateMerchant: vi.fn() }));
vi.mock("../services/ink-api.server", () => ({
  enrollOrder: vi.fn(),
  readRecordPrice: vi.fn(async () => null),
  setRecordPurchaseOutcome: vi.fn(),
}));
vi.mock("../services/ink-billing.server", () => ({
  inkRecordAction: vi.fn(async () => ({ ok: true, note: null, confirmationUrl: null, download: null, filename: null })),
  settleInkCharge: vi.fn(),
}));
vi.mock("../services/ink-merchant.server", () => ({
  readInkMerchant: vi.fn(async () => ({ shop: "made-up-shop.myshopify.com", doc: { ink_api_key: "ink_key_of_ink" }, shopId: "shop_example", backend: null })),
}));
vi.mock("../services/record-charges.server", () => ({ rememberRecordCharge: vi.fn(), settleRecordCharges: vi.fn() }));
vi.mock("../services/ritualist-rows.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/ritualist-rows.server")>();
  return {
    ...actual,
    ritualistApiKey: vi.fn(async () => "ink_key_example"),
    readShipmentPanels: vi.fn(async () => ({ records: { [PROOF]: RECORD }, timelines: { [PROOF]: TIMELINE } })),
  };
});

const { authenticate } = await import("../shopify.server");
const { inkRecordAction } = await import("../services/ink-billing.server");
const { readShipmentPanels } = await import("../services/ritualist-rows.server");
const { loader: shipmentsLoader } = await import("../routes/app.tagged-shipments._index");
const { action: recordAction } = await import("../routes/app.record");

const SHOP = "made-up-shop.myshopify.com";
const node = (over: Record<string, unknown>) => ({
  id: "gid://shopify/Order/1042",
  name: "#1042",
  createdAt: "2026-09-20T15:00:00Z",
  displayFinancialStatus: "PAID",
  displayFulfillmentStatus: "FULFILLED",
  email: "order@example.com",
  totalPriceSet: { shopMoney: { amount: "58.00", currencyCode: "USD" } },
  customer: { firstName: "Made", lastName: "Up", email: "buyer@example.com" },
  shippingAddress: { name: "Gift Recipient", address1: "1 Test St", address2: "", city: "Brooklyn", provinceCode: "NY", zip: "11201", country: "United States" },
  billingAddress: null,
  tags: ["Recorded by ink."],
  // Ten other ink metafields: `first: 10` stops short of proof_reference, which is asked for by key.
  metafields: { edges: Array.from({ length: 10 }, (_, i) => ({ node: { key: `other_${i}`, value: "x" } })) },
  openDistance: null,
  proof: { value: PROOF },
  lineItems: { pageInfo: { hasNextPage: false }, edges: [{ node: { title: "Bar Tape", quantity: 2, sku: "BT-1", originalUnitPriceSet: { shopMoney: { amount: "29.00" } }, image: null, customAttributes: [] } }] },
  shippingLine: { title: "Standard" },
  ...over,
});
const ORDERS = {
  data: {
    shop: { ianaTimezone: "America/New_York" },
    orders: { edges: [{ node: node({}) }, { node: node({ id: "gid://shopify/Order/1041", name: "#1041", tags: [], proof: null }) }] },
  },
};

afterEach(() => vi.unstubAllEnvs());

describe("the Shipments loader hands each ink order its panel", () => {
  let graphql: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    graphql = vi.fn(async () => ({ json: async () => ORDERS }));
    vi.mocked(authenticate.admin).mockResolvedValue({ admin: { graphql }, session: { shop: SHOP } } as never);
    vi.mocked(readShipmentPanels).mockClear();
  });

  it("reads the record and the rail with the merchant's key, for the ink orders, by the proof id asked for by key", async () => {
    const out = (await shipmentsLoader({ request: new Request("https://app.test/app/tagged-shipments"), params: {}, context: {} } as never)) as any;
    expect(String(graphql.mock.calls[0][0])).toContain('proof: metafield(namespace: "ink", key: "proof_reference") { value }');
    expect(readShipmentPanels).toHaveBeenCalledWith("ink_key_example", [PROOF]);
    expect(out.orders).toHaveLength(1);
    const row = out.orders[0].row;
    expect(row).toMatchObject({ id: "gid://shopify/Order/1042", name: "#1042", proofId: PROOF, record: RECORD, timeline: TIMELINE });
    expect(row.door).toEqual({ offerLine: null, pending: false, paidPendingRecord: false, resumeUrl: null, downloadable: true, inHistory: false, purchase: null });
  });

  it("the panel's recipient is the ship-to's own name with the order's email; the list keeps the buyer", async () => {
    const out = (await shipmentsLoader({ request: new Request("https://app.test/app/tagged-shipments"), params: {}, context: {} } as never)) as any;
    const detail = out.orders[0].row.detail;
    expect(detail).toMatchObject({ customerName: "Gift Recipient", customerEmail: "order@example.com", orderNumber: "#1042", total: "58.00", currency: "USD" });
    expect(detail.customerAddress).toMatchObject({ address1: "1 Test St", city: "Brooklyn", provinceCode: "NY", zip: "11201", country: "United States" });
    expect(out.orders[0].customerName).toBe("Made Up");
  });

  it("no timer re-reads every row's record", () => {
    const src = readFileSync(resolve(process.cwd(), "app/routes/app.tagged-shipments._index.tsx"), "utf8");
    expect(src).not.toMatch(/setInterval\(/);
  });
});

describe("/app/record: the included record's inspection and files", () => {
  const post = (fields: Record<string, string>) =>
    recordAction({ request: new Request("https://app.test/app/record", { method: "POST", body: new URLSearchParams(fields) }), params: {}, context: {} } as never);
  beforeEach(() => {
    vi.mocked(authenticate.admin).mockResolvedValue({ admin: {}, session: { shop: SHOP } } as never);
    vi.mocked(inkRecordAction).mockClear();
  });

  it("on the Ritualist, the inspection and the three files come through ink's reader with the Ritualist's key", async () => {
    vi.stubEnv("APP_FLAVOR", "");
    for (const intent of ["inspect", "pdf", "csv", "download"]) {
      vi.mocked(inkRecordAction).mockClear();
      await post({ intent, proof_id: PROOF });
      expect(inkRecordAction, intent).toHaveBeenCalledTimes(1);
      expect(vi.mocked(inkRecordAction).mock.calls[0][2], intent).toBe("ink_key_example");
    }
  });

  it("on the Ritualist, a purchase never takes that path", async () => {
    vi.stubEnv("APP_FLAVOR", "");
    const out = (await post({ intent: "buy", proof_id: PROOF, order_name: "#1042", return_to: "/app/tagged-shipments" })) as any;
    expect(inkRecordAction).not.toHaveBeenCalled();
    expect(out).toMatchObject({ ok: false, intent: "buy", confirmationUrl: null });
  });

  it("ink's door is as it was: every word but the outcome, with ink's own key", async () => {
    vi.stubEnv("APP_FLAVOR", "ink");
    for (const intent of ["inspect", "download", "buy"]) {
      vi.mocked(inkRecordAction).mockClear();
      await post({ intent, proof_id: PROOF });
      expect(inkRecordAction, intent).toHaveBeenCalledTimes(1);
      expect(vi.mocked(inkRecordAction).mock.calls[0][2], intent).toBe("ink_key_of_ink");
    }
  });
});
