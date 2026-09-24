// WHAT THE RITUALIST'S SHIPMENTS LEDGER READS, AND THE DOOR ITS RECORD ASKS.
//
//   · The Shipments loader reads its page the way ink's Orders reads it —
//     twenty orders, searched and sorted by Shopify (services/ink-links.server.ts)
//     — and answers at once; each row's panel follows as its own promise: the
//     record, the timeline and the Ritualist's door (services/ritualist-rows.server.ts),
//     read with the merchant's own key.
//   · The row says "Recipient": the ship-to's own name, and the order's own email.
//   · A failed read is an error the screen says as one, never "no orders".
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
vi.mock("../services/ink-api.server", () => ({
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
    ritualistRowRecord: vi.fn(async (apiKey: string | null, proofId: string | null) => ({
      record: proofId === PROOF ? RECORD : null,
      door: actual.includedRecordDoor(apiKey, proofId),
      packet: null,
      timeline: proofId === PROOF ? TIMELINE : null,
    })),
  };
});
// The published keys, read once for the page: never the network here.
vi.mock("../services/ink-record.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/ink-record.server")>()),
  readJwks: vi.fn(async () => ({ keys: [] })),
}));

const { authenticate } = await import("../shopify.server");
const { inkRecordAction } = await import("../services/ink-billing.server");
const { ritualistRowRecord } = await import("../services/ritualist-rows.server");
const { RECENT_ORDERS_DETAIL_QUERY } = await import("../services/ink-links.server");
const { loader: shipmentsLoader } = await import("../routes/app.tagged-shipments._index");
const { action: recordAction } = await import("../routes/app.record");

const SHOP = "made-up-shop.myshopify.com";
const node = (over: Record<string, unknown>) => ({
  id: "gid://shopify/Order/1042",
  name: "#1042",
  createdAt: "2026-09-20T15:00:00Z",
  email: "order@example.com",
  totalPriceSet: { shopMoney: { amount: "58.00", currencyCode: "USD" } },
  shippingAddress: { name: "Gift Recipient", address1: "1 Test St", address2: "", city: "Brooklyn", provinceCode: "NY", zip: "11201", country: "United States" },
  lineItems: { pageInfo: { hasNextPage: false }, nodes: [{ title: "Bar Tape", quantity: 2, sku: "BT-1", originalUnitPriceSet: { shopMoney: { amount: "29.00" } } }] },
  proof: { value: PROOF },
  ...over,
});
const PAGE = {
  data: {
    shop: { ianaTimezone: "America/New_York" },
    orders: {
      pageInfo: { hasNextPage: true, hasPreviousPage: false, startCursor: "c1", endCursor: "c2" },
      nodes: [node({}), node({ id: "gid://shopify/Order/1041", name: "#1041", proof: null })],
    },
  },
};
const load = (url: string) => shipmentsLoader({ request: new Request(url), params: {}, context: {} } as never) as Promise<any>;

afterEach(() => vi.unstubAllEnvs());

describe("the Shipments ledger reads its page the way ink's Orders does", () => {
  let graphql: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    graphql = vi.fn(async () => ({ json: async () => PAGE }));
    vi.mocked(authenticate.admin).mockResolvedValue({ admin: { graphql }, session: { shop: SHOP } } as never);
    vi.mocked(ritualistRowRecord).mockClear();
  });

  it("asks Shopify for twenty orders, searched and sorted there", async () => {
    const out = await load("https://app.test/app/tagged-shipments?q=%231042&sort=total_desc");
    expect(graphql).toHaveBeenCalledWith(RECENT_ORDERS_DETAIL_QUERY, {
      variables: expect.objectContaining({ first: 20, query: 'name:"1042"', sortKey: "TOTAL_PRICE", reverse: true }),
    });
    expect(out).toMatchObject({ search: "#1042", sort: "total_desc", ordersError: false, pageInfo: { hasNextPage: true, endCursor: "c2" } });
  });

  it("answers with Shopify's orders at once; each row's record, rail and the Ritualist's door follow as its own promise", async () => {
    const out = await load("https://app.test/app/tagged-shipments");
    const [recorded, bare] = out.orders;
    // The list does not wait for a record: each row streams its own (as ink's Orders does).
    expect(recorded).toMatchObject({ id: "gid://shopify/Order/1042", name: "#1042", proofId: PROOF });
    expect(recorded).not.toHaveProperty("record");
    expect(recorded.more).toBeInstanceOf(Promise);
    expect(recorded.detail).toMatchObject({ customerName: "Gift Recipient", customerEmail: "order@example.com", orderNumber: "#1042", total: "58.00" });
    // Read with the merchant's own key, the published keys once for the page.
    expect(ritualistRowRecord).toHaveBeenCalledWith("ink_key_example", PROOF, expect.any(Promise));
    expect(ritualistRowRecord).toHaveBeenCalledWith("ink_key_example", null, expect.any(Promise));
    const side = await recorded.more;
    expect(side).toMatchObject({ record: RECORD, timeline: TIMELINE, packet: null });
    expect(side.door).toEqual({ offerLine: null, pending: false, paidPendingRecord: false, resumeUrl: null, downloadable: true, inHistory: false, purchase: null });
    // An order ink did not record says so in its row; it offers nothing.
    const bareSide = await bare.more;
    expect(bare.proofId).toBeNull();
    expect(bareSide).toMatchObject({ record: null, timeline: null });
    expect(bareSide.door.downloadable).toBe(false);
  });

  it("a failed read is an error the screen says as one", async () => {
    graphql.mockRejectedValue(new Error("down"));
    const out = await load("https://app.test/app/tagged-shipments");
    expect(out).toMatchObject({ ordersError: true, orders: [] });
  });

  it("the stream waits as long as a record's whole read may take, as ink's does", async () => {
    vi.stubEnv("APP_FLAVOR", "");
    const { streamTimeout } = await import("../entry.server");
    const { RECORD_READ_TIMEOUT_MS } = await import("../services/ink-reader.server");
    expect(streamTimeout).toBeGreaterThan(RECORD_READ_TIMEOUT_MS);
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
