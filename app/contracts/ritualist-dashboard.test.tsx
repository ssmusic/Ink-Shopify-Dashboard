// THE RITUALIST'S DASHBOARD IS INK'S (Sam, 2026-09-24: "we are making the
// ritualist as good as ink" · "it has to mirror the ritualist webapp").
//   · It reads what ink's Dashboard reads — merchant-insights and
//     merchant-delivery — with the merchant's own key, never the admin secret,
//     and the last six orders the way the Shipments ledger reads its page.
//   · A failed read is said as unavailable, never as zero, and never costs the page.
//   · It draws ink's Dashboard whole, then the last six orders on ink's ledger
//     under "View all"; the Ritualist keeps set-up, the studio door, the order
//     value, Communications, the plan and Advanced — in Polaris, sentence case,
//     one blue, no colour that judges.
//   · The four-colour funnel and the tag-and-badge activity feed are out of the
//     render and kept in the tree.
// Made-up shop, orders and keys: this repository is public.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const PROOF = "proof_000000000000000000a10420";
const RECORD = {
  summary: { order_number: "#1042", opens: 1, first_open_at: "2026-09-22T19:00:00.000Z" },
  elements: [{ element: "delivery_date", label: "Delivery date", status: "attested", value: { delivered_at: "2026-09-22T18:00:00.000Z", source: "merchant" } }],
  locked: false,
  whole: true,
  forSale: null,
};

vi.mock("../firestore.server", () => ({ default: {}, firestore: {}, app: {} }));
vi.mock("../shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("../services/ink-api.server", () => ({ mintMagicToken: vi.fn() }));
// The NFC lane is tabled behind FEATURE_NFC (off) and imports through the app's
// "~" alias, which this plain node runner does not resolve (vitest.config.ts).
vi.mock("../components/NFCTagInventory", () => ({ default: () => null }));
// The published keys, read once for the six rows: never the network here.
vi.mock("../services/ink-record.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/ink-record.server")>()),
  readJwks: vi.fn(async () => ({ keys: [] })),
}));
vi.mock("../services/ritualist-rows.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/ritualist-rows.server")>();
  return {
    ...actual,
    ritualistApiKey: vi.fn(async () => "ink_key_example"),
    ritualistRowRecord: vi.fn(async (apiKey: string | null, proofId: string | null) => ({
      record: proofId === PROOF ? RECORD : null,
      door: actual.includedRecordDoor(apiKey, proofId),
      packet: null,
      timeline: null,
    })),
  };
});

const { authenticate } = await import("../shopify.server");
const { ritualistRowRecord } = await import("../services/ritualist-rows.server");
const { RECENT_ORDERS_DETAIL_QUERY } = await import("../services/ink-links.server");
const { kpisFromBody } = await import("../services/ink-kpis.server");
const { dashboardFrom } = await import("../services/ink-delivery.server");
const { timelineFrom } = await import("../services/ink-timeline.server");
const route = await import("../routes/app.dashboard");
const Dashboard = route.default;

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const text = (html: string) =>
  html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");

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

const SHOP = "made-up-shop.myshopify.com";
const INSIGHTS = { capped: false, throughput: { enrollments: 3, opened: 2, open_rate_pct: 66.7 }, integrity: { geofence: { gps_count: 1 } } };
const DELIVERY_ROWS = {
  rows: [
    { enrolled_at: "2026-09-18T10:00:00Z", delivered_at: "2026-09-20T10:00:00Z", tap_count: 2, location_source: "gps", last_tracking_status: "DELIVERED" },
    { enrolled_at: "2026-09-19T10:00:00Z", delivered_at: "2026-09-21T10:00:00Z", tap_count: 1, last_tracking_status: "DELIVERED" },
    { enrolled_at: "2026-09-20T10:00:00Z", tap_count: 0, last_tracking_status: "TRANSIT" },
  ],
  taps: [],
  capped: false,
};
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
const load = () =>
  route.loader({ request: new Request("https://example.test/app/dashboard"), params: {}, context: {} } as never) as Promise<any>;

describe("what the Dashboard reads", () => {
  let graphql: ReturnType<typeof vi.fn>;
  let calls: { url: string; headers: Record<string, string> }[];
  beforeEach(() => {
    calls = [];
    graphql = vi.fn(async () => ({ json: async () => PAGE }));
    vi.mocked(authenticate.admin).mockResolvedValue({ admin: { graphql }, session: { shop: SHOP } } as never);
    vi.mocked(ritualistRowRecord).mockClear();
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), headers: { ...(init?.headers as Record<string, string>) } });
      const body = String(url).endsWith("/merchant-insights") ? INSIGHTS : String(url).endsWith("/merchant-delivery") ? DELIVERY_ROWS : null;
      return new Response(JSON.stringify(body), { status: body ? 200 : 404 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads ink's two Dashboard doors with the merchant's own key, never the admin secret", async () => {
    const data = await load();
    const doors = calls.map((c) => new URL(c.url).pathname.split("/").pop()).sort();
    expect(doors).toEqual(["merchant-delivery", "merchant-insights"]);
    for (const c of calls) {
      expect(c.headers.Authorization).toBe("Bearer ink_key_example");
      expect(Object.keys(c.headers).map((k) => k.toLowerCase())).not.toContain("x-admin-secret");
    }
    expect(data.kpis).toEqual(kpisFromBody(INSIGHTS));
    expect(data.delivery).toEqual(dashboardFrom(DELIVERY_ROWS));
  });

  it("reads the last six orders the way the Shipments ledger reads its page, the record included", async () => {
    const data = await load();
    expect(graphql).toHaveBeenCalledWith(RECENT_ORDERS_DETAIL_QUERY, {
      variables: expect.objectContaining({ first: 6, sortKey: "CREATED_AT", reverse: true }),
    });
    // The orders at once; each row's record follows as its own promise, as on the ledger.
    expect(ritualistRowRecord).toHaveBeenCalledWith("ink_key_example", PROOF, expect.any(Promise));
    expect(ritualistRowRecord).toHaveBeenCalledWith("ink_key_example", null, expect.any(Promise));
    expect(data.recentOrders.map((o: { name: string }) => o.name)).toEqual(["#1042", "#1041"]);
    for (const row of data.recentOrders) expect(row.more).toBeInstanceOf(Promise);
    const [recorded, unrecorded] = await Promise.all(data.recentOrders.map((o: { more: Promise<any> }) => o.more));
    expect(recorded.record).toEqual(RECORD);
    expect(recorded.door).toMatchObject({ offerLine: null, downloadable: true, purchase: null });
    expect(unrecorded.record).toBeNull();
    expect(unrecorded.door.downloadable).toBe(false);
  });

  it("says a failed read as unavailable, and never throws the page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("backend down"); }));
    graphql.mockRejectedValue(new Error("Shopify down"));
    const data = await load();
    expect(data).toEqual({ kpis: null, delivery: null, recentOrders: null });
  });

  it("re-reads on Refresh, not on the studio door's press or a record's file", () => {
    const args = (formMethod?: string) => ({ formMethod, defaultShouldRevalidate: true }) as never;
    expect(route.shouldRevalidate(args("POST"))).toBe(false);
    expect(route.shouldRevalidate(args(undefined))).toBe(true);
  });
});

const TIMELINE = timelineFrom(
  { proof_id: PROOF, enrolled_at: "2026-09-20T15:01:00.000Z", delivered_at: "2026-09-22T18:00:00.000Z", delivery_source: "merchant", first_tap_at: "2026-09-22T19:00:00.000Z" },
  null,
  RECORD as never,
);
const ROW = {
  id: "gid://shopify/Order/1042",
  name: "#1042",
  proofId: PROOF,
  detail: {
    id: "1042", orderNumber: "#1042", customerName: "Gift Recipient", customerEmail: "order@example.com",
    customerAddress: { address1: "1 Test St", city: "Brooklyn", provinceCode: "NY", zip: "11201" },
    date: "Sep 20, 2026", total: "58.00", subtotal: "58.00", currency: "USD", status: "pending",
    items: [{ title: "Bar Tape", quantity: 2, price: "29.00", sku: "BT-1" }], metafields: {},
  },
  record: RECORD,
  door: { offerLine: null, pending: false, paidPendingRecord: false, resumeUrl: null, downloadable: true, inHistory: false, purchase: null },
  timeline: TIMELINE,
};

function render(loaderData: Record<string, unknown>) {
  const Stub = createRoutesStub([
    {
      id: "screen",
      path: "/",
      Component: () => (
        <AppProvider i18n={translations}>
          <Dashboard />
        </AppProvider>
      ),
    },
  ]);
  return renderToString(<Stub initialEntries={["/"]} hydrationData={{ loaderData: { screen: loaderData } }} />);
}

describe("what the Dashboard draws", () => {
  const whole = { kpis: kpisFromBody(INSIGHTS), delivery: dashboardFrom(DELIVERY_ROWS), recentOrders: [ROW] };

  it("leads with ink's Dashboard, whole, after set-up and the door to the studio", () => {
    const t = text(render(whole));
    const order = [
      "Dashboard", "Refresh",
      "The Ritualist Studio", "Open The Ritualist Studio",
      "Orders", "Location shared", "Counts cover orders with a record.",
      "Open rate", "Delivery rate", "Location sharing",
      "Delivery and opens", "Time to delivery", "Delivery status", "Opens without a tracking update",
      "Recent activity",
    ];
    let at = 0;
    for (const part of order) {
      const next = t.indexOf(part, at);
      expect(next, part).toBeGreaterThanOrEqual(at);
      at = next;
    }
  });

  it("ends on the last orders drawn on ink's ledger, the rest one press away in Shipments", () => {
    const html = render(whole);
    const t = text(html);
    for (const part of ["Recent activity", "View all", "Order", "Recipient", "Activity", "Total", "Date", "#1042", "Bar Tape", "Gift Recipient", "1 open", "Delivered · From Shopify's fulfillment", "$58.00", "Sep 20, 2026"]) expect(t).toContain(part);
    // The link that says "View all" is the one to Shipments (the nav's own link aside).
    expect(html).toMatch(/<a [^>]*href="\/app\/tagged-shipments"[^>]*>(?:(?!<\/a>)[\s\S])*View all(?:(?!<\/a>)[\s\S])*<\/a>/);
  });

  it("keeps the Ritualist's own cards, in sentence case", () => {
    const t = text(render(whole));
    for (const part of ["Enrolled order value", "Last 30 days", "Advanced — operational analytics"]) expect(t).toContain(part);
    // Changed on purpose: this kept the plan card. Sam, 2026-09-24, on its
    // "Your Shopify plan is Free.": "get rid of that" — Billing says the plan
    // as Shopify has it (ritualist-billing.test.tsx).
    expect(t).not.toContain("plan is Free");
    for (const gone of ["Open Funnel", "Enrolled Order Value", "Recent Activity", "View All", "Get the record", "$29", "Geofence"]) expect(t).not.toContain(gone);
  });

  it("says each unread part in one line and keeps the page", () => {
    const t = text(render({ kpis: null, delivery: null, recentOrders: null }));
    expect(t).toContain("Dashboard unavailable. Refresh to try again.");
    expect(t).toContain("Orders could not be loaded. Refresh to try again.");
    expect(t).toContain("Open The Ritualist Studio");
    // Sam, 2026-09-24: "its called open The Ritualist Studio not dashboard".
    expect(t).not.toContain("Ritualist dashboard");
    expect(text(render({ ...whole, recentOrders: [] }))).toContain("No orders are available from the past 60 days.");
  });
});

describe("what left the render, and what stays in the tree", () => {
  it("draws no set-up card and no notifications card, and deletes neither (Sam, 2026-09-24)", () => {
    // Changed on purpose: this contract kept "Communications" on the Dashboard.
    // Sam, on the live Dashboard: "we dont have notifacations yet" — the set-up
    // card asked for them, the Communications card said email was on, a done
    // step led nowhere and the brand preview's button was a picture.
    const dashboard = code("app/routes/app.dashboard.tsx");
    expect(dashboard).not.toMatch(/OnboardingChecklist|CommsCard|BrandPreviewCard/);
    for (const file of ["OnboardingChecklist", "CommsCard", "BrandPreviewCard"])
      expect(existsSync(resolve(process.cwd(), `app/components/${file}.tsx`)), file).toBe(true);
    const t = text(render({ kpis: kpisFromBody(INSIGHTS), delivery: dashboardFrom(DELIVERY_ROWS), recentOrders: [ROW] }));
    for (const gone of ["Set up the Ritualist", "Turn on delivery notifications", "Communications", "Email notifications", "Track your order", "Your brand"]) expect(t).not.toContain(gone);
  });

  it("draws neither the four-colour funnel nor the tag-and-badge feed, and deletes neither", () => {
    const dashboard = code("app/routes/app.dashboard.tsx");
    expect(dashboard).not.toMatch(/EngagementFunnel|RecentActivity/);
    expect(existsSync(resolve(process.cwd(), "app/components/EngagementFunnel.tsx"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "app/components/RecentActivity.tsx"))).toBe(true);
    // The merchant's numbers come with the merchant's key (services/ink-kpis.server.ts).
    expect(dashboard).not.toMatch(/getMerchantInsights|getMerchantTapStats/);
  });

  it("draws the Ritualist's cards in Polaris, with no colour for up, down or an outcome", () => {
    for (const file of ["app/components/RevenueThisPeriod.tsx", "app/components/CommsCard.tsx", "app/components/billing/PlanCard.tsx"]) {
      const src = code(file);
      expect(src, file).not.toMatch(/className=/);
      expect(src, file).not.toMatch(/emerald|red-\d|amber|violet|sky-\d/);
    }
    const advanced = code("app/components/AdvancedAnalytics.tsx");
    expect(advanced).not.toMatch(/tone=\{|tone="(success|info|warning|critical|attention)"/);
    expect(advanced).not.toMatch(/Geofence accuracy/);
  });
});
