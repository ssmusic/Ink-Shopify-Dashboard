// INK'S TWO SCREENS RENDER — server-side, with the loader data each stage
// produces, inside the same Polaris provider the layout gives them.
//
// tsc proves the props exist; only a render proves the tree stands. Each
// stage of the onboarding screen and both settings states are rendered to
// HTML and read back for the words a merchant would see, so a broken prop
// combination or a hook outside its router fails here rather than in a
// merchant's admin.

import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("../services/ink-install.server", () => ({ captureInkMark: vi.fn(), readShopIdentity: vi.fn() }));
vi.mock("../services/ink-merchant.server", () => ({
  readInkMerchant: vi.fn(),
  markOf: vi.fn(),
  brandNameOf: vi.fn(),
  stageOf: vi.fn(),
  flashForwardOf: vi.fn(),
  FLASH_FORWARDS: ["order_status", "carrier"],
}));
vi.mock("../services/merchant.server", () => ({ updateMerchant: vi.fn() }));
vi.mock("../services/ink-api.server", () => ({ patchMerchant: vi.fn(), mintMagicToken: vi.fn() }));

const { default: InkHome } = await import("../routes/app.ink._index");
const { default: InkSettings } = await import("../routes/app.ink.settings");
const { default: InkRecentOrders } = await import("../components/InkRecentOrders");
const { default: OrderExpandedRow } = await import("../components/OrderExpandedRow");

/** Render one route component with its loader data, the way the layout does. */
function render(Component: React.ComponentType, loaderData: Record<string, unknown>): string {
  const Stub = createRoutesStub([
    {
      id: "screen",
      path: "/",
      Component: () => (
        <AppProvider i18n={translations}>
          <Component />
        </AppProvider>
      ),
    },
  ]);
  // The onboarding loader's recent orders default to none, so each stage's
  // fixture names only what it is about.
  return renderToString(<Stub initialEntries={["/"]} hydrationData={{ loaderData: { screen: { recentOrders: [], ...loaderData } } }} />);
}

const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

// React warns that RouterProvider's useLayoutEffect does nothing on the
// server — true, and beside the point of a string render.
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

// A record as the backend's public read answers it (GET /verify/:id, Corvara #1010, 2026-09-23).
const RECORD = {
  locked: true,
  summary: { order_number: "#1010", buyer_initials: "SM", opens: 1, first_open_at: "2026-08-20T18:52:44.174Z" },
  elements: [
    { element: "order", label: "Order", status: "attested", value: { order_number: "#1010", enrolled_at: "2026-08-20T18:50:54.195Z" } },
    { element: "buyer", label: "Buyer", status: "attested", value: { tier: "new" } },
    { element: "delivery_date", label: "Delivery date", status: "missing", value: null },
    { element: "delivery_place", label: "Delivery place", status: "attested", value: { geocoded: true, verified_at_door: false } },
    { element: "carrier_scan", label: "Carrier scan", status: "missing", value: null },
    { element: "the_open", label: "The open", status: "verified", value: { first_open_at: "2026-08-20T18:52:44.174Z", first_open_signed: true, opens: 1, signed_opens: 1, non_human_opens: 0, location: { verdict: "flagged", distance_m: 719, accuracy_m: 35, signed: false } } },
  ],
};
const PROOF = "proof_aec827b527fb30457c1da890";
const detail = (over: Record<string, unknown> = {}) => ({
  id: "2", orderNumber: "#1010", customerName: "Made Up", customerEmail: "buyer@example.com",
  customerAddress: { address1: "1 Test St", city: "Brooklyn", provinceCode: "NY", zip: "11201" },
  date: "Aug 20, 2026", total: "58.00", subtotal: "58.00", currency: "USD", status: "enrolled",
  items: [{ title: "Bar Tape", quantity: 2, price: "29.00", sku: "BT-1" }], metafields: {}, ...over,
});
const ROWS = [
  { id: "gid://shopify/Order/2", name: "#1010", proofId: PROOF, detail: detail(), record: RECORD, door: { offerLine: "Get the record — $29", purchase: null } },
  { id: "gid://shopify/Order/1", name: "#1011", proofId: null, detail: detail({ id: "1", orderNumber: "#1011", customerName: "Guest", customerEmail: "", items: [] }), record: null, door: { offerLine: null, purchase: null } },
];
const openRow = (id: string) =>
  renderToString(
    <AppProvider i18n={translations}>
      {(() => {
        const Stub = createRoutesStub([{ id: "screen", path: "/", Component: () => <InkRecentOrders orders={ROWS} defaultExpandedId={id} /> }]);
        return <Stub initialEntries={["/"]} />;
      })()}
    </AppProvider>,
  );

describe("ink's home: the orders and their records, inside Shopify (Sam, 2026-09-23)", () => {
  it("is the orders — no logo to confirm, no upload box, no door out to a dashboard", () => {
    const html = render(InkHome, { stage: "ready", recentOrders: ROWS });
    const t = text(html);
    expect(t).toContain("Recent orders");
    for (const gone of ["Your mark", "Use this", "Look again", "Upload your own", "Open your dashboard", "Your dashboard"]) expect(t).not.toContain(gone);
    expect(html).not.toMatch(/type="file"/);
    expect(t).not.toContain("PLACEHOLDER");
  });

  it("says it is setting up while the install lands", () => {
    expect(text(render(InkHome, { stage: "provisioning", recentOrders: [] }))).toContain("Setting up your store");
    expect(text(render(InkHome, { stage: "ready", recentOrders: [] }))).not.toContain("Setting up your store");
  });

  it("lists orders the Ritualist's way, with the record's opens and location — never the NFC-era statuses", () => {
    const t = text(render(InkHome, { stage: "ready", recentOrders: ROWS }));
    for (const heading of ["Order", "Customer", "Date", "Total", "Opens", "Location"]) expect(t).toContain(heading);
    for (const nfc of ["Enrolled", "Verified", "Pending", "Cooldown", "Expired", "Status"]) expect(t).not.toContain(nfc);
    expect(t).toContain("#1010");
    expect(t).toContain("Made Up");
    expect(t).toContain("$58.00");
    expect(t).toContain("Outside 300 m");
    // Collapsed until clicked.
    expect(t).not.toContain("THE RECORD");
    expect(t).not.toContain("Get the record");
  });

  it("opens a row on its full record, in the record page's words, with the door at the bottom", () => {
    const html = openRow("gid://shopify/Order/2");
    const t = text(html);
    for (const part of ["CUSTOMER", "1 Test St", "PRODUCTS", "Bar Tape", "THE RECORD"]) expect(t).toContain(part);
    for (const label of ["Order", "Buyer", "Delivery date", "Delivery place", "Carrier scan", "The open"]) expect(t).toContain(label);
    for (const level of ["RECORDED AND SIGNED", "MISSING", "DEVICE-VERIFIED"]) expect(t).toContain(level);
    for (const line of ["Address on file", "Confirmed at the door", "First open signed", "Opens not a person's", "719 m from the delivery address (flagged)"]) expect(t).toContain(line);
    // The door is the last thing in the accordion.
    expect(t).toContain("Get the record — $29");
    expect(t.lastIndexOf("Get the record — $29")).toBeGreaterThan(t.indexOf("THE RECORD"));
    // Nothing links out of the app, and nothing of the Ritualist's panel copy leaks in.
    expect(html).not.toMatch(/href="https?:\/\//);
    expect(t).not.toContain("View Full Record");
    expect(t).not.toContain("View record");
    expect(t).not.toContain("Ritualist studio");
    expect(t).not.toContain("DELIVERY");
  });

  it("says an order has no record yet, and offers no door for it", () => {
    const t = text(openRow("gid://shopify/Order/1"));
    expect(t).toContain("No record yet.");
    expect(t).not.toContain("Get the record");
  });

  it("says there are no orders when the read found none", () => {
    expect(text(render(InkHome, { stage: "ready", recentOrders: [] }))).toContain("No orders yet");
  });

  it("writes ink with its period, every time (Sam: \"ink always has a period after it\")", () => {
    const screens = [
      text(render(InkHome, { stage: "ready", recentOrders: ROWS })),
      text(render(InkSettings, { flashForward: "order_status", canSave: true, ritualistUrl: "" })),
    ];
    for (const t of screens) expect(t).not.toMatch(/\bink\b(?!\.)/i);
    expect(screens[1]).toContain("includes ink.");
  });
});

describe("the pill nav, the Insights KPIs, and a bought record in the app (Sam, 2026-09-23)", () => {
  const pill = (html: string, id: string) => html.match(new RegExp(`<a[^>]*data-pill="${id}"[^>]*>`))?.[0] ?? "";

  it("puts Orders · Insights · Settings on top of every ink screen, the current one selected", () => {
    const orders = render(InkHome, { stage: "ready", recentOrders: ROWS });
    for (const id of ["orders", "insights", "settings"]) expect(pill(orders, id)).not.toBe("");
    expect(pill(orders, "orders")).toContain('aria-selected="true"');
    expect(pill(orders, "insights")).toContain('aria-selected="false"');
    expect(pill(orders, "insights")).toContain('href="/app/ink?view=insights"');
    expect(pill(orders, "settings")).toContain('href="/app/ink/settings"');
    const settings = render(InkSettings, { flashForward: "order_status", canSave: true, ritualistUrl: "" });
    expect(pill(settings, "settings")).toContain('aria-selected="true"');
    const insights = render(InkHome, { section: "insights", stage: "ready", kpis: null, recentOrders: [] });
    expect(pill(insights, "insights")).toContain('aria-selected="true"');
  });

  it("shows the Insights numbers on the Insights pill, and no order list there", () => {
    const t = text(render(InkHome, { section: "insights", stage: "ready", recentOrders: [], kpis: { recorded: 12, opened: 7, openRatePct: 58, locationShared: 2, signedPct: 100, disputed: 0, capped: false } }));
    for (const part of ["Orders recorded", "12", "Opened", "7", "58 in every 100", "Location shared", "2", "Signed", "100%", "Disputed"]) expect(t).toContain(part);
    expect(t).not.toContain("Recent orders");
    expect(t).not.toContain("2,000 most recent");
  });

  it("says nothing has shipped yet when there are no numbers at all", () => {
    expect(text(render(InkHome, { section: "insights", stage: "ready", kpis: null, delivery: null, recentOrders: [] }))).toContain("Nothing shipped yet");
  });

  it("is the big dashboard: the console's Delivery page for this one merchant, every number also in words", () => {
    const delivery = {
      orders: 5,
      funnel: [
        { key: "orders", label: "Orders", count: 5, ofAbovePct: null },
        { key: "delivered", label: "Delivered", count: 4, ofAbovePct: 80 },
        { key: "opened", label: "Opened", count: 3, ofAbovePct: 75 },
        { key: "shared", label: "Location shared", count: 2, ofAbovePct: 66.7 },
        { key: "door", label: "Seen at the door", count: 1, ofAbovePct: 50 },
      ],
      transit: { buckets: [{ label: "under 1 d", count: 1 }, { label: "1–2 d", count: 1 }, { label: "2–4 d", count: 0 }, { label: "4–7 d", count: 1 }, { label: "over 7 d", count: 0 }], measured: 3, delivered: 4, medianHours: 30 },
      carrier: [{ status: "DELIVERED", count: 3, ofEnrolledPct: 60 }, { status: "No carrier update", count: 2, ofEnrolledPct: 40 }],
      waited: { stuck: 1, withData: 2, sharePct: 50 },
      carrierNamed: 2,
      capped: false,
    };
    const t = text(render(InkHome, { section: "insights", stage: "ready", recentOrders: [], kpis: { recorded: 5, opened: 3, openRatePct: 60, locationShared: 2, signedPct: 100, disputed: 0, capped: false }, delivery }));
    for (const part of ["Getting there", "Orders through to the door", "Seen at the door", "80% of the step above", "Time in transit", "3 of 4 delivered orders carry both times", "median 30 h", "What the carrier said", "DELIVERED", "60% of orders", "While they waited", "of 2 opens that carry a movement time", "Not recorded yet", "only 2 orders name one so far", "Orders recorded"]) expect(t).toContain(part);
  });

  it("shows a bought record's dispute packet inside the accordion — three texts, each with Copy — and no link out", () => {
    const bought = [{
      ...ROWS[0],
      door: { offerLine: null, purchase: { id: "pur_1", packet_url: "https://www.in.ink/verify/x?key=k", outcome: "won" as const } },
      packet: { accessActivityLog: "Opened 1 time after the order.", uncategorizedText: "The record of #1010.", shippingDocumentation: "No carrier scan yet." },
    }];
    const html = renderToString(
      <AppProvider i18n={translations}>
        {(() => {
          const Stub = createRoutesStub([{ id: "screen", path: "/", Component: () => <InkRecentOrders orders={bought} defaultExpandedId={ROWS[0].id} /> }]);
          return <Stub initialEntries={["/"]} />;
        })()}
      </AppProvider>,
    );
    const t = text(html);
    for (const part of ["DISPUTE PACKET", "Access activity log", "Opened 1 time after the order.", "Shipping documentation", "No carrier scan yet.", "Additional information", "The record of #1010.", "Did you win?"]) expect(t).toContain(part);
    // The static render holds the desktop table AND the phone cards; count in the table.
    const desktop = text(html.slice(0, html.indexOf("lg:hidden")));
    expect((desktop.match(/\bCopy\b/g) ?? []).length).toBe(3);
    expect(t).not.toContain("Open the record");
    expect(html).not.toMatch(/href="https?:\/\//);
    expect(t.indexOf("DISPUTE PACKET")).toBeGreaterThan(t.indexOf("THE RECORD"));
  });
});

describe("each order's timeline, inside the accordion (Sam, 2026-09-23)", () => {
  const H = 3_600_000;
  const T0 = Date.parse("2026-09-01T00:00:00Z");
  const at = (h: number) => new Date(T0 + h * H).toISOString();
  const timeline = {
    steps: [
      { key: "enrolled", label: "Enrolled", state: "done" as const, at: at(0), note: null },
      { key: "shipped", label: "Shipped", state: "carrier" as const, at: at(10), note: "from the carrier" },
      { key: "in_transit", label: "In transit", state: "not_recorded" as const, at: null, note: "from the carrier" },
      { key: "delivered", label: "Delivered", state: "done" as const, at: at(40), note: null },
      { key: "opened", label: "Opened", state: "done" as const, at: at(45), note: null },
      { key: "return_started", label: "Return started", state: "not_recorded" as const, at: null, note: null },
      { key: "refund_cleared", label: "Refund cleared", state: "not_recorded" as const, at: null, note: "no event for refunds yet" },
    ],
    address: { lat: 34.052235, lng: -118.243683 },
    opens: [
      { at: at(45), verdict: "pass", distance_m: 56, accuracy_m: 12, lat: 34.052701, lng: -118.243311 },
      { at: at(50), verdict: "flagged", distance_m: 719, accuracy_m: 35, lat: 34.058123, lng: -118.250456 },
      { at: at(60), verdict: "not_shared", distance_m: null, accuracy_m: null, lat: null, lng: null },
    ],
    window: { deliveredAt: at(40), windowEnd: at(112), firstOpenAt: at(45), hoursToOpen: 5, openPositionPct: 6.9, withinExpectedWindow: true },
  };
  const withTimeline = [{ ...ROWS[0], timeline }];
  const open = () =>
    renderToString(
      <AppProvider i18n={translations}>
        {(() => {
          const Stub = createRoutesStub([{ id: "screen", path: "/", Component: () => <InkRecentOrders orders={withTimeline} defaultExpandedId={ROWS[0].id} /> }]);
          return <Stub initialEntries={["/"]} />;
        })()}
      </AppProvider>,
    );

  it("draws the address and every open that carried a fix on the map, with the fix-less open in words", () => {
    const html = open();
    const desktop = html.slice(0, html.indexOf("lg:hidden"));
    expect(desktop).toMatch(/data-testid="opens-map"[^>]*data-points="2"|data-points="2"[^>]*data-testid="opens-map"/);
    const t = text(desktop);
    expect(t).toContain("Opened 56 m from the delivery address — within the 100 m range.");
    expect(t).toContain("56 m · within 100 m");
    expect(t).toContain("719 m · outside 300 m");
    expect(t).toContain("location not shared");
    expect(t).toContain("100 m and 300 m rings");
  });

  it("never prints a coordinate as text — the map draws the point, the words say the distance", () => {
    const t = text(open());
    for (const coord of ["34.05", "-118.24", "34.058", "-118.250"]) expect(t).not.toContain(coord);
  });

  it("shows the lifecycle and the delivery window, under the record's words and above the door", () => {
    const t = text(open().slice(0, open().indexOf("lg:hidden")));
    for (const part of ["THE ORDER, STEP BY STEP", "Enrolled", "Shipped", "from the carrier", "Delivered", "Opened", "Refund cleared", "THE DELIVERY WINDOW", "5 h after delivery", "Within the expected window", "Yes"]) expect(t).toContain(part);
    const record = t.indexOf("THE RECORD");
    const rail = t.indexOf("THE ORDER, STEP BY STEP");
    const door = t.lastIndexOf("Get the record — $29");
    expect(record).toBeGreaterThan(-1);
    expect(rail).toBeGreaterThan(record);
    expect(door).toBeGreaterThan(rail);
  });
});

describe("the settings screen", () => {
  it("offers the two forwards with the backend's dial selected, and the Ritualist's door", () => {
    const html = render(InkSettings, { flashForward: "carrier", canSave: true, ritualistUrl: "https://apps.shopify.com/example-listing" });
    expect(html).toContain('name="flash_forward"');
    expect(html).toMatch(/value="carrier"[^>]*checked|checked[^>]*value="carrier"/);
    expect(text(html)).toContain("Your Shopify order page");
    expect(text(html)).toContain("The carrier's tracking page");
    expect(html).toContain('href="https://apps.shopify.com/example-listing"');
    expect(text(html)).toContain("Add The Ritualist");
  });

  it("defaults to the order page and disables the Ritualist door without a listing address", () => {
    const html = render(InkSettings, { flashForward: "order_status", canSave: true, ritualistUrl: "" });
    expect(html).toMatch(/value="order_status"[^>]*checked|checked[^>]*value="order_status"/);
    expect(html).not.toContain("apps.shopify.com");
    expect(text(html)).toContain("Add The Ritualist");
  });

  it("holds the dial until the install has landed", () => {
    const html = render(InkSettings, { flashForward: "order_status", canSave: false, ritualistUrl: "" });
    expect(text(html)).toContain("still being set up");
  });

  it("names the moment in the merchant's words, never ours", () => {
    // "The flash" is our word for the buyer's moment; no merchant says it
    // (Sam, 2026-09-23). The form field keeps its wire name — only the words
    // a merchant reads are pinned.
    const html = render(InkSettings, { flashForward: "order_status", canSave: true, ritualistUrl: "" });
    expect(text(html)).toContain("When a customer opens their tracking link");
    expect(text(html).toLowerCase()).not.toContain("flash");
    const home = render(InkHome, { stage: "ready", recentOrders: ROWS });
    expect(text(home).toLowerCase()).not.toContain("flash");
  });
});

describe("the Ritualist's order panel is unchanged by ink's footer", () => {
  it("renders its three props exactly as before: the full-record button, the studio sentence, no footer", () => {
    const order = {
      id: "7", orderNumber: "#1007", customerName: "Made Up", customerEmail: "buyer@example.com",
      customerAddress: { address1: "1 Test St", city: "Brooklyn", provinceCode: "NY", zip: "11201" },
      date: "Sep 21, 2026", total: "58.00", subtotal: "58.00", currency: "USD", status: "enrolled",
      items: [{ title: "Bar Tape", quantity: 2, price: "29.00", sku: "BT-1" }], metafields: {},
    };
    const html = renderToString(
      <AppProvider i18n={translations}>
        <OrderExpandedRow order={order} onCollapse={() => {}} onViewFull={() => {}} />
      </AppProvider>,
    );
    const t = text(html);
    expect(t).toContain("View Full Record");
    expect(html).not.toContain("href=");
    expect(t).toContain("Open history, location, and the signed delivery record live in your Ritualist studio.");
    expect(t).not.toContain("Get the record");
  });
});
