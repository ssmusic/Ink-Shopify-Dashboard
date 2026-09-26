// INK'S OLDER ORDERS (Sam, 2026-09-24: "the orders cap out at 10 - whats that
// about? need a scroll on the left or a link at the bottom to load more" ·
// "yes build it"). Shopify shares an app only the last 60 days of orders; the
// Orders screen's "Load more" continues from ink's own records
// (ink-backend GET /merchant-orders), twenty at a time:
//   1. each backend row becomes the ledger's order — Shopify's "#" name, the
//      shop's day, where it ships (city, state, country), items, total;
//   2. the read goes with the merchant's own key, and a failure is null —
//      never an empty page in its place;
//   3. the loader's `?older=` answers from ink's records alone (no Shopify
//      read), each row's record streaming like a Shopify row's, and a failed
//      read is `older: null` — a fetcher's error would take the page down;
//   4. Load more is offered at the foot of the whole list, newest first,
//      alone — and the older orders continue the list with no line between
//      (Sam, of one: "get rid of this slop").
// Made-up shop, orders and people: this repository is public.
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../firestore.server", () => ({ default: {}, firestore: {}, app: {} }));
vi.mock("../shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("../services/ink-api.server", () => ({ createRecordPurchase: vi.fn(), patchMerchant: vi.fn(), mintMagicToken: vi.fn(), readRecordPriceOrUnknown: vi.fn(async () => undefined) }));
vi.mock("../services/ink-merchant.server", () => ({
  readInkMerchant: vi.fn(async () => ({ shop: "made-up-shop.myshopify.com", shopId: "shop_made_up", doc: { ink_api_key: "ink_made_up_key" } })),
  stageOf: vi.fn(() => "ready"),
}));
vi.mock("../services/ink-links.server", () => ({
  readRecentOrderPage: vi.fn(async () => ({ rows: [], pageInfo: null })),
  readShopZone: vi.fn(async () => "America/Los_Angeles"),
}));
vi.mock("../services/ink-older-orders.server", async (actual) => ({ ...(await actual<object>()), readOlderOrders: vi.fn() }));
vi.mock("../services/ink-billing.server", () => ({
  inkDoor: vi.fn(async () => ({ record: null, offerLine: "Buy the record ($29 USD)", pending: false, paidPendingRecord: false, resumeUrl: null, downloadable: false, inHistory: false })),
}));
vi.mock("../services/ink-timeline.server", () => ({ readTimelineReads: vi.fn(async () => null), timelineOfReads: vi.fn(async () => null) }));
vi.mock("../services/record-charges.server", () => ({ readRecordDoors: vi.fn(async () => ({})), recordDoorFor: vi.fn(() => ({ purchase: null })) }));
vi.mock("../services/ink-record.server", () => ({ readJwks: vi.fn(async () => null) }));

const { authenticate } = await import("../shopify.server");
const { readRecentOrderPage } = await import("../services/ink-links.server");
const { readOlderOrders } = await import("../services/ink-older-orders.server");
const real = await vi.importActual<typeof import("../services/ink-older-orders.server")>("../services/ink-older-orders.server");
const { ALL_ORDER_DATES } = await import("../lib/ink-order-search");
const ink = await import("../routes/app.ink.$section");

const PROOF = "proof_0123456789abcdef01234567";
const ROW = {
  proof_id: PROOF,
  order_id: "5550001017",
  order_number: "1017",
  ordered_at: "2026-07-06T02:55:04.815Z",
  customer_name: "Made Up",
  customer_email: "buyer@example.com",
  ships_to: { city: "Los Angeles", state: "California", country: "United States" },
  items: [{ name: "Lug Sole Loafer", quantity: 1, price: "109.95" }],
  items_truncated: false,
  total_price: "109.95",
  currency: "USD",
};

describe("an older order, as the ledger draws it", () => {
  it("is Shopify's name, the shop's day, where it ships, what was bought and the total", () => {
    expect(real.olderOrderFrom(ROW, "America/Los_Angeles")).toEqual({
      id: `ink-record-${PROOF}`,
      name: "#1017",
      proofId: PROOF,
      createdAt: "2026-07-06T02:55:04.815Z",
      detail: {
        id: "5550001017",
        orderNumber: "#1017",
        customerName: "Made Up",
        customerEmail: "buyer@example.com",
        customerAddress: { address1: "", city: "Los Angeles", provinceCode: "California", zip: "", country: "United States" },
        // 02:55 UTC on the 6th is the 5th in Los Angeles.
        date: "Jul 5, 2026",
        total: "109.95",
        subtotal: "109.95",
        currency: "USD",
        status: "enrolled",
        itemsTruncated: false,
        items: [{ title: "Lug Sole Loafer", quantity: 1, price: "109.95", sku: "" }],
        metafields: {},
      },
    });
  });

  it("keeps a name that already reads as Shopify's, and a gid's number", () => {
    const row = real.olderOrderFrom({ ...ROW, order_number: "#1017", order_id: "gid://shopify/Order/5550001017" });
    expect(row?.name).toBe("#1017");
    expect(row?.detail.id).toBe("5550001017");
  });

  it("draws no address it was not given, and says so for a missing buyer", () => {
    const row = real.olderOrderFrom({ ...ROW, ships_to: { city: null, state: null, country: null }, customer_name: null, customer_email: null });
    expect(row?.detail).not.toHaveProperty("customerAddress");
    expect(row?.detail.customerName).toBe("Name unavailable");
    expect(row?.detail.customerEmail).toBe("");
  });

  it("is no order at all without a record's id", () => {
    for (const bad of [null, "row", { ...ROW, proof_id: "INK-mr123" }, { ...ROW, proof_id: undefined }]) expect(real.olderOrderFrom(bad)).toBeNull();
  });
});

describe("reading a page of older orders", () => {
  const answer = (body: unknown, ok = true) =>
    vi.fn(async (..._args: unknown[]) => ({ ok, json: async () => body }) as Response);

  it("asks ink's backend with the merchant's own key, before the cursor, twenty at a time", async () => {
    const fetchImpl = answer({ shop_id: "shop_made_up", rows: [ROW, { proof_id: "not-a-record" }], next: "2026-07-01T00:27:50.128Z" });
    const page = await real.readOlderOrders("ink_made_up_key", "2026-08-07T19:04:16Z", Promise.resolve("UTC"), fetchImpl as never);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/merchant-orders\?before=2026-08-07T19%3A04%3A16\.000Z&limit=20$/);
    expect(init.headers).toEqual({ Authorization: "Bearer ink_made_up_key" });
    expect(page?.rows.map((r) => r.name)).toEqual(["#1017"]);
    expect(page?.next).toBe("2026-07-01T00:27:50.128Z");
  });

  it("ends with a null cursor, and is null — never an empty page — when the backend cannot say", async () => {
    expect((await real.readOlderOrders("k", "2026-08-07T19:04:16Z", "UTC", answer({ rows: [], next: null }) as never))?.next).toBeNull();
    expect(await real.readOlderOrders("k", "2026-08-07T19:04:16Z", "UTC", answer({ error: "x" }, false) as never)).toBeNull();
    expect(await real.readOlderOrders("k", "2026-08-07T19:04:16Z", "UTC", answer({ rows: "nope" }) as never)).toBeNull();
    const never = answer({ rows: [] });
    expect(await real.readOlderOrders(null, "2026-08-07T19:04:16Z", "UTC", never as never)).toBeNull();
    expect(await real.readOlderOrders("k", "not a date", "UTC", never as never)).toBeNull();
    expect(never).not.toHaveBeenCalled();
  });
});

describe("the Orders loader's older page", () => {
  const load = async (url: string) => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({ admin: {}, session: { shop: "made-up-shop.myshopify.com" } } as never);
    return ((await ink.loader({ request: new Request(url), params: { section: "orders" }, context: {} } as never)) as { data: Record<string, any> }).data;
  };

  it("answers from ink's records alone, each row's record streaming like a Shopify row's", async () => {
    vi.mocked(readRecentOrderPage).mockClear();
    vi.mocked(readOlderOrders).mockResolvedValueOnce({ rows: [real.olderOrderFrom(ROW)!], next: "2026-07-01T00:27:50.128Z" });
    const data = await load("https://install.in.ink/app/ink/orders?older=2026-08-07T19%3A04%3A16.000Z");
    const [key, before, zone] = vi.mocked(readOlderOrders).mock.calls.at(-1)!;
    expect([key, before]).toEqual(["ink_made_up_key", "2026-08-07T19:04:16.000Z"]);
    await expect(zone).resolves.toBe("America/Los_Angeles");
    expect(readRecentOrderPage).not.toHaveBeenCalled();
    expect(data.recentOrders).toEqual([]);
    expect(data.older.next).toBe("2026-07-01T00:27:50.128Z");
    expect(data.older.rows[0]).toMatchObject({ id: `ink-record-${PROOF}`, name: "#1017", proofId: PROOF });
    expect(data.older.rows[0].more).toBeInstanceOf(Promise);
    await expect(data.older.rows[0].more).resolves.toMatchObject({ door: { offerLine: "Buy the record ($29 USD)" } });
  });

  it("says a failed read is a failure, and never throws it", async () => {
    vi.mocked(readOlderOrders).mockResolvedValueOnce(null);
    expect((await load("https://install.in.ink/app/ink/orders?older=2026-08-07T19%3A04%3A16.000Z")).older).toBeNull();
    vi.mocked(readOlderOrders).mockRejectedValueOnce(new Error("boom"));
    expect((await load("https://install.in.ink/app/ink/orders?older=2026-08-07T19%3A04%3A16.000Z")).older).toBeNull();
  });
});

describe("where Load more is offered", () => {
  // React warns that RouterProvider's useLayoutEffect does nothing on the server.
  const realError = console.error;
  beforeAll(() => {
    console.error = (...args: unknown[]) => {
      if (String(args[0]).includes("useLayoutEffect does nothing on the server")) return;
      realError(...args);
    };
  });
  afterAll(() => {
    console.error = realError;
  });
  const text = (html: string) =>
    html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const LINK = "Load older records";
  const LINE = "That is every order from the past 60 days.";
  const lastPage = { hasNextPage: false, hasPreviousPage: false, startCursor: "c1", endCursor: "c1" };
  const SHOPIFY_ROW = { id: "gid://shopify/Order/1042", name: "#1042", proofId: null, createdAt: "2026-09-10T12:00:00Z", detail: null, more: new Promise(() => {}) };
  const screen = (over: Record<string, unknown> = {}) => {
    const loaderData = { section: "orders", stage: "ready", recentOrders: [SHOPIFY_ROW], ordersError: false, search: "", sort: "newest", pageInfo: lastPage, dates: ALL_ORDER_DATES, dateBounds: { min: "2026-07-26" }, mapsKey: null, ...over };
    const Stub = createRoutesStub([{ id: "screen", path: "/", Component: () => <AppProvider i18n={translations}><ink.default /></AppProvider> }]);
    return text(renderToString(<Stub initialEntries={["/"]} hydrationData={{ loaderData: { screen: loaderData } }} />));
  };

  it("at the foot of the whole list, newest first — the list's last word, with no line of its own", () => {
    const t = screen();
    expect(t).toContain(LINK);
    expect(t.trim().endsWith(LINK)).toBe(true);
    expect(t).not.toContain(LINE);
    expect(t).not.toContain("ink's records");
    // The subtitle says nothing the list can outgrow.
    expect(t).toContain("Open an order to review its delivery and opens.");
    expect(t).not.toContain("Orders from the past 60 days");
  });

  it("with no order in Shopify's window too, where the empty list already says so", () => {
    const t = screen({ recentOrders: [] });
    expect(t).toContain("No orders are available from the past 60 days.");
    expect(t).toContain(LINK);
    expect(t).not.toContain(LINE);
  });

  it("never under a search, narrower dates, another order, a page with more after it, an error or a store still setting up", () => {
    for (const [why, over] of [
      ["search", { search: "#1042" }],
      ["7 days", { dates: { range: "7d", from: null, to: null } }],
      ["custom dates", { dates: { range: "custom", from: "2026-09-01", to: "2026-09-15" } }],
      ["oldest first", { sort: "oldest" }],
      ["total", { sort: "total_desc" }],
      ["more pages", { pageInfo: { ...lastPage, hasNextPage: true } }],
      ["error", { ordersError: true, recentOrders: [] }],
      ["setting up", { stage: "provisioning" }],
    ] as const) expect(screen(over), why).not.toContain(LINK);
  });

  it("continues the ledger without its column headings", async () => {
    const { default: InkRecentOrders } = await import("../components/InkRecentOrders");
    const Stub = (headings: boolean) =>
      createRoutesStub([{ id: "list", path: "/", Component: () => <AppProvider i18n={translations}><InkRecentOrders orders={[SHOPIFY_ROW] as never} headings={headings} /></AppProvider> }]);
    const draw = (headings: boolean) => {
      const S = Stub(headings);
      return text(renderToString(<S initialEntries={["/"]} />));
    };
    expect(draw(true)).toContain("Activity");
    expect(draw(false)).not.toContain("Activity");
    expect(draw(false)).toContain("#1042");
  });
});
