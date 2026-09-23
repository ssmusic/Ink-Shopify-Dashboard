// INK'S SCREENS RENDER — server-side, with the loader data each stage
// produces, inside the same Polaris provider the layout gives them.
//
// Two design passes met on these screens on 2026-09-23 (the Codex audit, #133,
// and the rulings pass, #131, with #134, #135, #137 and #138 after it). This
// file pins both: Codex's Polaris screens and honesty fixes, and every ruling
// Sam gave — no judging of a distance, no rings, no default range, one blue,
// Google's map, the rail with no title and no NFC-era steps, the Dashboard's
// three numbers — and every feature main carried: the checkout beside the
// opens, the browsers line, the whole record with its checks, the press on an
// open, the dispute packet and "Did you win?".
//
// tsc proves the props exist; only a render proves the tree stands. Each
// stage of the onboarding screen and both settings states are rendered to
// HTML and read back for the words a merchant would see, so a broken prop
// combination or a hook outside its router fails here rather than in a
// merchant's admin.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

const { default: InkHome, loader: loadInkHome } = await import("../routes/app.ink._index");
const { default: InkSettings, action: saveInkSettings } = await import("../routes/app.ink.settings");
const { default: InkKpis } = await import("../components/InkKpis");
const { default: OrderTimeline, DeliveryWindowBar } = await import("../components/OrderTimeline");
const { timelineFrom } = await import("../services/ink-timeline.server");
const { dashboardFrom } = await import("../services/ink-delivery.server");
const { default: InkRecentOrders, RecordWords } = await import("../components/InkRecentOrders");
const { RecordEventRow } = await import("../components/InkRecordInspection");
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
  { id: "gid://shopify/Order/2", name: "#1010", proofId: PROOF, detail: detail(), record: RECORD, door: { offerLine: "Get the record ($29 USD)", purchase: null } },
  { id: "gid://shopify/Order/1", name: "#1011", proofId: null, detail: detail({ id: "1", orderNumber: "#1011", customerName: "Name unavailable", customerEmail: "", items: [] }), record: null, door: { offerLine: null, purchase: null } },
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
const openRows = (rows: unknown[], mapsKey: string | null = null) =>
  renderToString(
    <AppProvider i18n={translations}>
      {(() => {
        const Stub = createRoutesStub([{ id: "screen", path: "/", Component: () => <InkRecentOrders orders={rows as typeof ROWS} defaultExpandedId={ROWS[0].id} mapsKey={mapsKey} /> }]);
        return <Stub initialEntries={["/"]} />;
      })()}
    </AppProvider>,
  );

describe("ink's orders: the orders and their records, inside Shopify (Sam, 2026-09-23)", () => {
  it("is the orders — no logo to confirm, no upload box, no door out to a dashboard", () => {
    const html = render(InkHome, { stage: "ready", recentOrders: ROWS });
    const t = text(html);
    expect(t).toContain("Recent orders");
    for (const gone of ["Your mark", "Use this", "Look again", "Upload your own", "Open your dashboard", "Your dashboard"]) expect(t).not.toContain(gone);
    expect(html).not.toMatch(/type="file"/);
    expect(t).not.toContain("PLACEHOLDER");
  });

  it("lists each order as a row — number, recipient, total, opens and the open's distance — never an NFC-era status, never a judgment", () => {
    const t = text(render(InkHome, { stage: "ready", recentOrders: ROWS }));
    for (const part of ["Orders", "#1010", "Made Up", "$58.00", "1 open"]) expect(t).toContain(part);
    for (const nfc of ["Enrolled", "Verified", "Pending", "Cooldown", "Expired", "Status"]) expect(t).not.toContain(nfc);
    // The open's distance is a word in the row (Sam: "we dont judge").
    expect(t).toContain("719 m");
    expect(t).not.toMatch(/Outside 300 m|Within 100 m|Within 300 m|outside|flagged/);
    // Collapsed until clicked.
    expect(t).not.toContain("The record");
    expect(t).not.toContain("Get the record");
    for (const gone of ["Shipping Free", "Your mark", "Upload your own", "PLACEHOLDER"]) expect(t).not.toContain(gone);
  });

  it("opens an order with its recipient, products and Advanced disclosure", () => {
    const html = openRow(ROWS[0].id);
    const t = text(html);
    for (const part of ["Recipient", "Order email: buyer@example.com", "1 Test St", "Products", "Bar Tape", "Order total $58.00", "Advanced", "Get the record"]) expect(t).toContain(part);
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toMatch(/href="https?:\/\//);
    // No price beside the button (Sam: "loose the price next to the get the record button").
    expect(t).not.toContain("$29");
    expect(html).toContain("Polaris-Button--variantTertiary");
    for (const gone of ["THE RECORD", "CUSTOMER", "attach as a file", "Checked in this browser", "Shipping Free", "View Full Record", "View record", "Ritualist studio"]) expect(t).not.toContain(gone);
  });

  it("opens on the full record, in the record page's words — never the backend's verdict, never the at-the-door yes/no", () => {
    const t = text(openRow(ROWS[0].id));
    for (const label of ["The record", "Order", "Buyer", "Delivery date", "Delivery place", "Carrier scan", "The open"]) expect(t).toContain(label);
    for (const level of ["Recorded and signed", "Missing", "Device-verified"]) expect(t).toContain(level);
    for (const line of ["Address on file", "First open signed", "Opens not a person's", "719 m from the delivery address", "Recorded"]) expect(t).toContain(line);
    // Neither judges against the range (Sam: "we dont judge"); "Enrolled" is the NFC era's word.
    expect(t).not.toContain("(flagged)");
    expect(t).not.toContain("Confirmed at the door");
    expect(t).not.toContain("Enrolled");
  });

  it("does not call the shipping recipient the buyer or invent missing contact and product details", () => {
    const t = text(openRow(ROWS[1].id));
    expect(t).toContain("Recipient unavailable");
    expect(t).toContain("Order email: Unavailable");
    expect(t).toContain("Product details are unavailable");
    expect(t).not.toContain("Customer");
  });

  it("says an order has no record, and offers no door for it", () => {
    const t = text(openRow(ROWS[1].id));
    expect(t).toContain("No record is linked to this order.");
    expect(t).not.toContain("Get the record");
  });

  it("keeps missing records and failed reads distinct from empty orders", () => {
    expect(text(render(InkHome, { stage: "ready", recentOrders: [] }))).toContain("No orders are available from the past 60 days.");
    const searched = text(render(InkHome, { stage: "ready", recentOrders: [], search: "missing", sort: "newest" }));
    expect(searched).toContain("No orders match this search.");
    expect(searched).toContain("Clear search");
    expect(searched).not.toContain("No orders are available");
    const failed = text(render(InkHome, { stage: "ready", recentOrders: [], ordersError: true }));
    expect(failed).toContain("Orders could not be loaded");
    expect(failed).not.toContain("No orders are available");
    expect(text(openRow(ROWS[0].id))).not.toContain("Back to orders");
  });

  it("shows a bounded setup state and a refresh action", () => {
    const t = text(render(InkHome, { stage: "provisioning", recentOrders: [] }));
    expect(t).toContain("Setting up your store");
    expect(t).toContain("Refresh");
    expect(text(render(InkHome, { stage: "ready", recentOrders: [] }))).not.toContain("Setting up your store");
  });

  it("writes ink with its period, every time (Sam: \"ink always has a period after it\")", () => {
    const connection = { shop: "sample.myshopify.com", name: "Sample goods", logoUrl: null, shopify: "unavailable", ink: "connected", checkedAt: null };
    const screens = [
      text(render(InkHome, { stage: "ready", recentOrders: ROWS })),
      text(openRow(ROWS[0].id)),
      text(render(InkSettings, { ritualistUrl: "https://apps.shopify.com/example-listing", privacy: [], connection })),
      text(render(InkHome, { section: "help", stage: null })),
      text(render(InkHome, { section: "insights", stage: "ready", kpis: { recorded: 3, opened: 2, openRate: 67, locationShared: 1, capped: false }, delivery: null })),
    ];
    // The brand word, never the domain (info@in.ink).
    for (const t of screens) expect(t).not.toMatch(/(?<![.@\w])ink\b(?!\.)/i);
    expect(screens[2]).toContain("includes ink.");
    // No rings on the map, and the Help says none (Sam: "we dont have a default range").
    expect(screens[3]).not.toMatch(/\brings?\b/i);
  });

  it("names the buyer's moment in the merchant's words, never ours (\"the flash\")", () => {
    expect(text(render(InkSettings, { ritualistUrl: "", privacy: [] })).toLowerCase()).not.toContain("flash");
    expect(text(render(InkHome, { stage: "ready", recentOrders: ROWS })).toLowerCase()).not.toContain("flash");
  });
});

describe("the merchant's WHOLE record in the accordion (Sam, 2026-09-23: \"the 29 gets it signed\")", () => {
  // As services/ink-record.server.ts reads it through the merchant door with
  // the shop's own key: the words, the checks and every signed event, in words.
  const WHOLE = {
    ...RECORD,
    locked: false,
    whole: true,
    forSale: { price_cents: 2900, currency: "USD" },
    checks: { sound: true, headline: "Checked against the published key: 3 of 3 signatures verified · every link intact.", lines: ["Signatures: 3 of 3 verified against key_001", "Hash links: 3 of 3 intact · sequence complete"] },
    events: [
      { seq: 1, event_id: "evt_1", type: "Order recorded", at: "2026-08-20T18:50:54.195Z", check: "verified", legacy: false },
      { seq: 2, event_id: "evt_2", type: "Opened", at: "2026-08-20T18:52:44.174Z", check: "verified", legacy: false },
      { seq: 3, event_id: "evt_3", type: "Carrier delivered", at: "2026-08-22T15:10:00.000Z", check: "verified", legacy: false },
    ],
  };
  const FOR_SALE = { offerLine: "Get the record ($29 USD)", purchase: null, downloadable: false };
  const open = (record: unknown, door: Record<string, unknown> = FOR_SALE) => openRows([{ ...ROWS[0], record, door }]);

  it("opens on the words, the checks and every signed event — in words, never a hash or a coordinate", () => {
    const html = open(WHOLE);
    const t = text(html);
    for (const part of ["The record", "Checks", "Checked against the published key: 3 of 3 signatures verified · every link intact.", "Signatures: 3 of 3 verified against key_001", "Hash links: 3 of 3 intact · sequence complete", "Signed events", "1 · Order recorded", "2 · Opened", "3 · Carrier delivered"]) expect(t).toContain(part);
    expect((t.match(/\bverified\b/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // The door opens Advanced; then the words, the checks, the events.
    expect(t.indexOf("Get the record")).toBeLessThan(t.indexOf("The record"));
    expect(t.indexOf("Checks")).toBeGreaterThan(t.indexOf("The open"));
    expect(t.indexOf("Signed events")).toBeGreaterThan(t.indexOf("Checks"));
    expect(html).not.toMatch(/[0-9a-f]{64}|signed_bytes|payload_hash|34\.0|-118\./);
    expect(t).not.toMatch(/\bink\b(?!\.)/i);
    // Seeing the record is free: while the hand-over is for sale, no file is offered.
    expect(t).not.toMatch(/Download PDF|Download CSV|Download record/);
  });

  it("the door says what the purchase buys — the signed copy to hand over — with no price beside it", () => {
    const t = text(open(WHOLE));
    expect(t).toContain("Get the record");
    expect(t).toContain("The signed copy to hand over.");
    expect(t).not.toContain("$29");
  });

  it("a record read as words only (no key yet) shows no checks and no events — exactly as before", () => {
    const t = text(open(RECORD));
    expect(t).toContain("The record");
    expect(t).not.toContain("Checks");
    expect(t).not.toContain("Signed events");
  });

  it("shows a bought record's dispute packet inside the accordion — three texts, each with Copy — with \"Did you win?\" and no link out", () => {
    const html = openRows([{
      ...ROWS[0],
      door: { offerLine: null, purchase: { id: "pur_1", packet_url: "https://www.in.ink/verify/x?key=k", outcome: "won" as const } },
      packet: { accessActivityLog: "Opened 1 time after the order.", uncategorizedText: "The record of #1010.", shippingDocumentation: "No carrier scan yet." },
    }]);
    const t = text(html);
    for (const part of ["Access activity log", "Opened 1 time after the order.", "Shipping documentation", "No carrier scan yet.", "Additional information", "The record of #1010.", "Did you win?"]) expect(t).toContain(part);
    // Sam, 2026-09-23: "its called the record" — never "dispute packet".
    expect(t).not.toMatch(/dispute packet/i);
    expect((t.match(/\bCopy\b/g) ?? []).length).toBe(3);
    expect(t).not.toContain("attach as a file");
    expect(t).not.toContain("Open the record");
    expect(html).not.toMatch(/href="https?:\/\//);
    // The record's words, then the bought record under the same name.
    expect((html.match(/<h3[^>]*>The record<\/h3>/g) ?? []).length).toBe(2);
    expect(t.indexOf("Access activity log")).toBeGreaterThan(t.indexOf("The open"));
  });
});

describe("the record's door and the hand-over", () => {
  it("offers the files only once the hand-over is the merchant's", () => {
    const html = render(() => <InkRecentOrders orders={[{ ...ROWS[0], door: { offerLine: null, downloadable: true } }]} defaultExpandedId={ROWS[0].id} />, {});
    expect(text(html)).toContain("Download record");
    expect(text(html)).toContain("JSON file");
    expect(text(html)).toContain("while it remains in the recent-order list");
    expect(text(html)).not.toContain("You can download it again from Records");
    expect(text(html)).toContain("Download PDF");
    expect(text(html)).not.toMatch(/attach as a file|Did you win/);
  });

  it("does not offer file formats when access is unavailable", () => {
    const t = text(render(() => <InkRecentOrders orders={[{ ...ROWS[0], door: { offerLine: null, downloadable: false, pending: false } }]} defaultExpandedId={ROWS[0].id} />, {}));
    expect(t).toContain("Record access is unavailable");
    expect(t).not.toMatch(/Export the record|PDF report|Download PDF|Get the record/);
  });

  it("describes an approved charge as waiting for record access, without a second approval action", () => {
    const html = render(() => <InkRecentOrders orders={[{
      ...ROWS[0],
      door: { offerLine: null, pending: true, paidPendingRecord: true, resumeUrl: null, downloadable: false },
    }]} defaultExpandedId={ROWS[0].id} />, {});
    const t = text(html);
    expect(t).toContain("Shopify approved the charge, but the record is not available yet.");
    expect(t).toContain("Check record access");
    expect(t).not.toContain("Check payment status");
    expect(t).not.toContain("Continue Shopify approval");
    expect(t).not.toContain("Get the record ($29 USD)");
    expect(t).not.toContain("Payment is pending");
  });

  it("shows the whole record in words before purchase — never its signed detail — and offers the hand-over", () => {
    const t = text(render(() => <InkRecentOrders orders={[{
      ...ROWS[0], record: { ...RECORD, locked: false, whole: true, forSale: { price_cents: 2900, currency: "USD" } },
      door: { offerLine: "Get the record ($29 USD)", downloadable: false },
    }]} defaultExpandedId={ROWS[0].id} />, {}));
    for (const part of ["The record", "The open", "Get the record", "The signed copy to hand over."]) expect(t).toContain(part);
    // Sam, 2026-09-23: "they need to see all the info but not get the signed hash".
    expect(t).not.toMatch(/Checked in this browser|Event history|Download PDF|Download CSV|Download record/);
  });

  it("says the record's words as the record page does — no verdict word, no browser-verification claim", () => {
    const t = text(renderToString(<AppProvider i18n={translations}><RecordWords record={RECORD as never} /></AppProvider>));
    for (const part of ["The record", "Recorded and signed", "Device-verified", "First open signed", "719 m from the delivery address"]) expect(t).toContain(part);
    expect(t).not.toMatch(/flagged|Confirmed at the door|Seen at the door|Checked in this browser|outside|default range/);
  });

  it("keeps the words short: the event list and its checks live in their own sections, never inside the words", () => {
    const whole = { ...RECORD, locked: false, whole: true, events: [{ seq: 1, event_id: "event_12345678", type: "Opened", at: "2026-09-20T00:00:00Z", check: "verified", legacy: false }] };
    const t = text(renderToString(<AppProvider i18n={translations}><RecordWords record={whole as never} /></AppProvider>));
    expect(t).toContain("The record");
    expect(t).not.toContain("event_12345678");
    expect(t).not.toContain("Checked in this browser");
  });

  it("shows record history with a repeat download and an honest missing-purchase path", () => {
    const html = render(InkHome, { section: "records", stage: "ready", recordHistory: [{ proofId: PROOF, orderName: "#1010", createdAt: "2026-09-20T00:00:00Z", state: "minted", door: { offerLine: null, pending: false, downloadable: true }, record: { ...RECORD, locked: false } }], historyError: false, historyPage: 1, historyHasNext: false, historyHasPrevious: false });
    const t = text(html);
    expect(t).toContain("Your record library");
    expect(html).toContain("Download PDF for #1010");
    expect(html).toContain("Download CSV for #1010");
    expect(html).toContain("Download JSON for #1010");
    expect(t).toContain("View record details");
    expect(t).toContain("Files are not emailed");
    expect(t).toContain("If a past purchase is missing");
  });

  it("keeps multiple purchased records downloadable and pending purchases out of the library", () => {
    const history = [1, 2, 3].map((n) => ({ proofId: `proof_${String(n).repeat(24)}`, orderName: `#100${n}`, createdAt: "2026-09-20T00:00:00Z", state: "minted", door: { offerLine: "Get the record ($29 USD)", downloadable: true }, record: { ...RECORD, locked: false } }));
    const html = render(InkHome, { section: "records", stage: "ready", recordHistory: [...history, { proofId: PROOF, orderName: "#1004", createdAt: null, state: "paid_pending_record", door: { offerLine: null, downloadable: false, pending: true, paidPendingRecord: true }, record: null }], historyError: false, historyHasNext: true, historyHasPrevious: false });
    for (const n of [1, 2, 3]) expect(html).toContain(`Download PDF for #100${n}`);
    expect(html).not.toContain("Download PDF for #1004");
    expect(text(html)).not.toContain("Get the record");
    expect(text(html)).toContain("Needs attention");
    expect(text(html)).toContain("Check record access");
  });

  it("puts a bought record's files before its evidence and shows each open only once", () => {
    const timeline = timelineFrom({ enrolled_at: "2026-09-01T00:00:00Z" }, { address: { lat: 34, lng: -118 }, opens: [{ at: "2026-09-02T00:00:00Z", outcome: "success", gps_verdict: "flagged", distance_m: 719, accuracy_m: 35, lat: 34.005, lng: -118.004 }] }, RECORD as never);
    const t = text(render(() => <InkRecentOrders orders={[{ ...ROWS[0], timeline, door: { offerLine: null, downloadable: true } }]} defaultExpandedId={ROWS[0].id} />, {}));
    expect(t.indexOf("Download PDF")).toBeLessThan(t.indexOf("The record"));
    expect(t.indexOf("The record")).toBeLessThan(t.indexOf("Checked in this browser"));
    expect(t.match(/Every open/g)?.length).toBe(1);
    expect(t).not.toContain("Inspect full record");
    expect(t).toContain("No email is sent");
  });

  it("shows a bought record's event detail, each signature as the server's check found it", () => {
    const event = { id: "event_12345678", type: "TAP_RECORDED", at: "2026-09-20T00:00:00Z", sequence: 1, legacy: false, keyId: "key_001", payloadHash: "a".repeat(64), previousEventId: null, previousHash: null, signature: "b".repeat(128), signedBytes: "{}", unverifiable: false, location: { lat: 34.005, lng: -118.004 } };
    const row = (signature?: string) => text(renderToString(<AppProvider i18n={translations}><RecordEventRow event={event} check={{ id: event.id, hash: "matches", link: "first" }} signature={signature} /></AppProvider>));
    const unchecked = row();
    for (const part of [event.id, event.payloadHash, event.signature, "key_001", "Signature supplied, not checked", "Hash matches", "Link first", "Opened"]) expect(unchecked).toContain(part);
    expect(unchecked).not.toContain("Signature verified");
    expect(row("verified")).toContain("Signature verified");
    expect(row("does not verify")).toContain("Signature does not verify");
  });
});

describe("the Dashboard: three numbers, the orders' funnel, and the rates (Sam, 2026-09-23)", () => {
  const KPIS = { recorded: 12, opened: 7, openRate: 58, locationShared: 2, capped: false };

  it("names the tab Dashboard, first, as Polaris tabs with links", () => {
    const html = render(InkHome, { section: "insights", stage: "ready", kpis: null, delivery: null });
    expect(text(html)).toContain("Dashboard");
    expect(text(html)).not.toContain("Insights");
    expect(html).toContain("Polaris-Tabs");
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('href="/app/ink/settings"');
    expect(html.indexOf('href="/app/ink?view=insights"')).toBeLessThan(html.indexOf('href="/app/ink"'));
  });

  it("has exactly three numbers — Orders, Open, Location shared — with nothing under them", () => {
    const html = renderToString(<AppProvider i18n={translations}><InkKpis kpis={KPIS} /></AppProvider>);
    const t = text(html);
    for (const part of ["Orders", "Open", "Location shared", "12", "7", "2"]) expect(t).toContain(part);
    // Sam: "orders recorded is just be called orders" · "opened should just be open" ·
    // "nothing underneath those numbers" · "the signed 100% should not be there" · "disputed should be gone".
    for (const gone of ["Orders recorded", "Opened", "Signed", "100%", "Disputed", "58 in every 100", "since your first order", "by the customer's phone", "2,000"]) expect(t).not.toContain(gone);
  });

  it("says the numbers could not be read when the read failed — never an empty store, never zeros", () => {
    const t = text(render(InkHome, { section: "insights", stage: "ready", kpis: null, delivery: null }));
    expect(t).toContain("couldn't be read");
    expect(t).not.toMatch(/No orders|Nothing shipped/);
  });

  it("says there are no orders with records yet when ink holds none — never a row of zeros, never a claim about the store's orders", () => {
    const t = text(render(InkHome, { section: "insights", stage: "ready", delivery: null, kpis: { recorded: 0, opened: 0, openRate: null, locationShared: 0, capped: false } }));
    expect(t).toContain("No orders with records are available yet.");
    expect(t).not.toMatch(/NaN|Infinity|0%/);
  });

  it("draws the orders' funnel under the numbers — no title, one line on how it counts, none of the sections Sam called weird", () => {
    const delivery = dashboardFrom({ rows: [
      { enrolled_at: "2026-09-01T00:00:00Z", delivered_at: "2026-09-02T06:00:00Z", tap_count: 1, location_source: "gps", verified_at_door: true, last_tracking_status: "DELIVERED" },
      { delivered_at: "2026-09-02T06:00:00Z" },
    ], taps: [], capped: false });
    const t = text(render(InkHome, { section: "insights", stage: "ready", kpis: KPIS, delivery }));
    for (const part of ["Each step counts the orders that also passed the step above.", "Delivered", "Open", "Location shared"]) expect(t).toContain(part);
    for (const gone of [
      "Getting there", "From the order being recorded", "Orders through to the door", "Seen at the door",
      "Time in transit", "Time to delivery", "What the carrier said", "Delivery status", "DELIVERED", "While they waited",
      "Opens without a tracking update", "Not recorded yet", "Did it arrive", "Orders recorded", "Delivery and opens",
    ]) expect(t).not.toContain(gone);
  });

  it("renders the rates each from one door and its own denominator — no browser needed, no joined samples", () => {
    const delivery = dashboardFrom({ rows: [{ delivered_at: "2026-09-20T00:00:00Z" }, {}], taps: [] });
    const html = render(InkHome, { section: "insights", stage: "ready", kpis: { ...KPIS, capped: true }, delivery });
    for (const part of ["58%", "7 of 12 orders", "50%", "1 of 2 orders", "17%", "2 of 12 orders"]) expect(text(html)).toContain(part);
  });

  it("says when the delivery door did not answer, where the funnel would be", () => {
    const t = text(render(InkHome, { section: "insights", stage: "ready", kpis: KPIS, delivery: null }));
    expect(t).toContain("Delivery details are unavailable");
    expect(t).not.toContain("Each step counts");
  });
});

describe("each order's timeline, inside the accordion (Sam, 2026-09-23)", () => {
  const H = 3_600_000;
  const T0 = Date.parse("2026-09-01T00:00:00Z");
  const at = (h: number) => new Date(T0 + h * H).toISOString();
  const timeline = {
    steps: [
      { key: "shipped", label: "Shipped", state: "carrier" as const, at: at(10), note: "from the carrier" },
      { key: "in_transit", label: "In transit", state: "not_recorded" as const, at: null, note: "from the carrier" },
      { key: "delivered", label: "Delivered", state: "done" as const, at: at(40), note: null },
      { key: "opened", label: "Opened", state: "done" as const, at: at(45), note: null },
    ],
    address: { lat: 34.052235, lng: -118.243683 },
    opens: [
      { at: at(45), verdict: "pass", distance_m: 56, accuracy_m: 12, lat: 34.052701, lng: -118.243311 },
      { at: at(50), verdict: "flagged", distance_m: 719, accuracy_m: 35, lat: 34.058123, lng: -118.250456 },
      { at: at(60), verdict: "not_shared", distance_m: null, accuracy_m: null, lat: null, lng: null },
    ],
    window: { deliveredAt: at(40), windowEnd: at(112), firstOpenAt: at(45), hoursToOpen: 5, openPositionPct: 6.9, withinExpectedWindow: true },
    opensAvailable: true,
    opensCapped: false,
  };
  const withTimeline = [{ ...ROWS[0], timeline }];

  it("lists every open beside the map — each fix a point, the fix-less open in words — and never judges a distance", () => {
    const html = openRows(withTimeline, "test-browser-key");
    expect(html).toMatch(/data-testid="opens-map"[^>]*data-points="2"|data-points="2"[^>]*data-testid="opens-map"/);
    const t = text(html);
    for (const part of ["Every open", "Delivery address", "1 Test St", "56 m", "719 m", "location not shared", "A shared device location does not confirm receipt of the parcel."]) expect(t).toContain(part);
    // Sam: "we dont judge" · "we dont have a default range" — no rings, no range words.
    for (const judged of ["within 100 m", "outside 300 m", "within 300 m", "range", "rings", "100 m and 300 m"]) expect(t).not.toContain(judged);
  });

  it("draws no map without the browser key — the words still say every open", () => {
    const html = openRows(withTimeline, null);
    expect(html).not.toContain('data-testid="opens-map"');
    const t = text(html);
    expect(t).toContain("56 m");
    expect(t).toContain("719 m");
    expect(t).toContain("location not shared");
  });

  it("says which browsers the opens came from, under the opens — and nothing when the record counted none", () => {
    const browsers = { count: 2, unknown_opens: 1, list: [
      { label: "A", device: "iPhone", opens: 2, first_open_at: at(45), last_open_at: at(50), first_seen_after_delivered_scan: true },
      { label: "B", device: "Mac", opens: 1, first_open_at: at(60), last_open_at: at(60), first_seen_after_delivered_scan: true },
    ] };
    const t = text(openRows([{ ...ROWS[0], record: { ...RECORD, browsers }, timeline }]));
    const line = "Opened from 2 browsers: iPhone ×2, Mac ×1, browser unknown ×1. All 2 were first seen after the carrier's delivered scan.";
    expect(t).toContain(line);
    expect(t.indexOf(line)).toBeGreaterThan(t.indexOf("location not shared"));
    expect(t).not.toContain("default range");
    expect(text(openRows(withTimeline))).not.toContain("Opened from");
  });

  it("never prints a coordinate as text — the map draws the point, the words say the distance", () => {
    const t = text(openRows(withTimeline, "test-browser-key"));
    for (const coord of ["34.05", "-118.24", "34.058", "-118.250"]) expect(t).not.toContain(coord);
  });

  it("shows the rail with no title and no NFC-era or return steps, and the delivery window as facts — never a verdict", () => {
    const t = text(openRows(withTimeline));
    for (const part of ["Shipped", "from the carrier", "In transit", "Delivered", "Opened", "Delivery and first open", "5 hours after delivery", "Recording window ends"]) expect(t).toContain(part);
    // Sam: "THE ORDER, STEP BY STEP is weird"; no "Enrolled" (the NFC era's word); no return or refund step (ink has neither).
    for (const gone of ["THE ORDER, STEP BY STEP", "Order activity", "Return started", "Refund cleared", "Enrolled", "Within the expected window", "promised"]) expect(t).not.toContain(gone);
    // The rail sits above Advanced; the door opens Advanced; the record follows.
    expect(t.indexOf("Shipped")).toBeLessThan(t.indexOf("Get the record"));
    expect(t.indexOf("Get the record")).toBeLessThan(t.indexOf("The record"));
  });

  it("never guesses arrival against a promised window", () => {
    const t = text(renderToString(<AppProvider i18n={translations}><DeliveryWindowBar w={{ deliveredAt: "2026-09-01T00:00:00Z", windowEnd: "2026-09-03T00:00:00Z", firstOpenAt: "2026-09-01T05:00:00Z", hoursToOpen: 5, openPositionPct: 10, withinExpectedWindow: true }} /></AppProvider>));
    expect(t).toContain("Recording window ends");
    expect(t).toContain("5 hours after delivery");
    expect(t).not.toMatch(/promised|expected|within|Yes/);
  });

  it("draws the whole timeline block on its own, the same way", () => {
    const html = renderToString(<AppProvider i18n={translations}><OrderTimeline data={timeline} mapsKey="test-browser-key" addressLabel="1 Test St, Brooklyn, NY" /></AppProvider>);
    const t = text(html);
    for (const part of ["Shipped", "Every open", "1 Test St", "719 m", "Recording window ends"]) expect(t).toContain(part);
    for (const gone of ["100 m and 300 m", "default range", "outside the 300", "within the 100", "THE ORDER", "OpenStreetMap", "34.0"]) expect(t).not.toContain(gone);
  });
});

describe("one palette (Sam, 2026-09-23: \"some pages are blue and others green\")", () => {
  const INK_FILES = [
    "app/components/OpensMap.tsx",
    "app/components/OrderTimeline.tsx",
    "app/components/DeliveryDashboard.tsx",
    "app/components/InkDashboardRates.tsx",
    "app/components/InkKpis.tsx",
    "app/components/InkRecentOrders.tsx",
    "app/components/InkRecordEvidence.tsx",
    "app/components/InkPillNav.tsx",
    "app/routes/app.ink._index.tsx",
  ];
  const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

  it("draws every data mark in the one blue, and no green, amber or red — no colour judges a distance", () => {
    for (const f of INK_FILES) {
      const code = src(f);
      // No green of any family (Polaris success hexes, the console's emerald, any rgb/hsl green),
      // no Polaris caution amber or critical red, and no second blue (Polaris's own info/highlight blues).
      expect(code, f).not.toMatch(/#29845a|#008060|#16a34a|#22c55e|rgb\(16 185 129\)|rgba\(41, 132, 90|hsl\(1[2-5]\d|#b98900|#c70a24|#005BD3/i);
      expect(code.match(/tone="(success|critical|warning|caution|highlight)"/g) ?? [], f).toEqual([]);
      // A notice may be Polaris's own info banner; a mark, a badge or a highlight never takes its blue.
      expect(code, f).not.toMatch(/(border|bg-surface|text)-info\b|<Badge[^>]*tone="info"|<Icon[^>]*tone="info"/);
    }
    for (const f of ["app/components/OpensMap.tsx", "app/components/OrderTimeline.tsx", "app/components/InkDashboardRates.tsx", "app/components/InkRecentOrders.tsx"]) {
      expect(src(f), f).toContain("INK_DATA");
    }
    // The funnel is Polaris Viz's own, in its Light theme — the blue INK_DATA is taken from.
    expect(src("app/components/DeliveryDashboard.tsx")).toContain('theme="Light"');
  });

  it("never badges an order \"seen at the door\" — that is the 100 m range, said as a verdict (Sam: \"we dont judge\")", () => {
    const door = { ...RECORD, elements: RECORD.elements.map((e) => (e.element === "delivery_place" ? { ...e, value: { geocoded: true, verified_at_door: true } } : e)) };
    const withDoor = text(openRows([{ ...ROWS[0], record: door }]));
    expect(withDoor).not.toContain("Seen at the door");
    expect(withDoor).not.toContain("Confirmed at the door");
    expect(withDoor).toContain("719 m");
  });
});

describe("the settings screen", () => {
  it("has no destination choice and never claims automatic forwarding is live (Sam: \"remove this choice from normal Settings\")", () => {
    const html = render(InkSettings, { ritualistUrl: "https://apps.shopify.com/example-listing", privacy: [] });
    for (const part of ["Tracking link destination", "Shopify order page", "Carrier tracking page", "Save destination", "Destination saved", "original destination", "When a customer opens their tracking link"]) expect(text(html)).not.toContain(part);
    expect(html).not.toContain('name="flash_forward"');
    expect(html).not.toContain('disabled=""');
  });

  it("draws the Ritualist's door only with a listing address — the review fix, word for word (B2)", () => {
    const withUrl = render(InkSettings, { ritualistUrl: "https://apps.shopify.com/example-listing", privacy: [] });
    expect(withUrl).toContain('href="https://apps.shopify.com/example-listing"');
    expect(text(withUrl)).toContain("Add The Ritualist");
    expect(text(withUrl)).toContain("The Ritualist includes ink.");
    const without = render(InkSettings, { ritualistUrl: "", privacy: [] });
    expect(without).not.toContain("apps.shopify.com");
    expect(text(without)).not.toContain("Add The Ritualist");
    expect(text(without)).not.toContain("The Ritualist");
    expect(without).not.toContain('disabled=""');
  });

  it("authenticates and rejects retired destination forms without writing the shared dial", async () => {
    const { authenticate } = await import("../shopify.server");
    const { patchMerchant } = await import("../services/ink-api.server");
    const { updateMerchant } = await import("../services/merchant.server");
    vi.mocked(patchMerchant).mockClear();
    vi.mocked(updateMerchant).mockClear();
    vi.mocked(authenticate.admin).mockResolvedValueOnce({ session: { shop: "sample.myshopify.com" } } as never);
    const args = { request: new Request("https://app.test/app/ink/settings", { method: "POST", body: new URLSearchParams({ flash_forward: "carrier" }) }) } as never;
    const response = await saveInkSettings(args);
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
    expect(patchMerchant).not.toHaveBeenCalled();
    expect(updateMerchant).not.toHaveBeenCalled();
    vi.mocked(authenticate.admin).mockRejectedValueOnce(new Response(null, { status: 401 }));
    await expect(saveInkSettings(args)).rejects.toMatchObject({ status: 401 });
  });

  it("shows outstanding privacy requests as awaiting completion", () => {
    const t = text(render(InkSettings, { ritualistUrl: "", privacy: [{ id: "1", topic: "customers/data_request", requestId: "88", dueAt: "2026-10-23T00:00:00Z" }] }));
    expect(t).toContain("awaiting completion");
    expect(t).toContain("Data request 88");
    expect(t).toContain("Contact support");
  });
});

describe("help and store connection", () => {
  it("keeps Help authenticated but independent of ink setup and backend availability", async () => {
    const { authenticate } = await import("../shopify.server");
    const { readInkMerchant } = await import("../services/ink-merchant.server");
    vi.mocked(authenticate.admin).mockResolvedValueOnce({ admin: {}, session: { shop: "sample.myshopify.com" } } as never);
    vi.mocked(readInkMerchant).mockClear();
    const result = await loadInkHome({ request: new Request("https://app.test/app/ink?view=help") } as never);
    expect(result.data).toEqual({ section: "help", stage: null });
    expect(result.init?.headers).toEqual({ "Cache-Control": "private, no-store" });
    expect(readInkMerchant).not.toHaveBeenCalled();
    vi.mocked(authenticate.admin).mockRejectedValueOnce(new Response(null, { status: 401 }));
    await expect(loadInkHome({ request: new Request("https://app.test/app/ink?view=help") } as never)).rejects.toMatchObject({ status: 401 });
  });

  it("explains downloads and record limits with working navigation", () => {
    const html = render(InkHome, { section: "help", stage: null });
    const t = text(html);
    for (const part of ["Review an order", "Buy a record", "Download again", "does not email", "Check payment status", "Check record access", "Contact support"]) expect(t).toContain(part);
    expect(html).toContain('href="/app/ink?view=records"');
    expect(html).toContain('href="mailto:info@in.ink"');
    expect(t).not.toContain("Recent orders");
    expect(html).not.toContain('disabled=""');
  });

  it("separates Shopify access from ink availability without claiming sync or a second login", () => {
    const html = render(InkSettings, { ritualistUrl: "", privacy: [], connection: {
      shop: "sample.myshopify.com", name: "Sample goods", logoUrl: null,
      shopify: "connected", ink: "unavailable", checkedAt: "2026-09-23T20:00:00Z",
    } });
    const t = text(html);
    for (const part of ["Sample goods", "sample.myshopify.com", "Connected", "Could not connect", "Check connection", "Account access is managed in Shopify", "They do not confirm that every order"]) expect(t).toContain(part);
    expect(html).not.toMatch(/type="password"|Sync complete|All orders synced/);
    expect(t).toContain("SG");
  });

  it("never labels unchecked preview or incomplete setup as connected", () => {
    for (const ink of ["not_checked", "setup"]) {
      const t = text(render(InkSettings, { ritualistUrl: "", privacy: [], connection: {
        shop: "sample.myshopify.com", name: "Sample store", logoUrl: null,
        shopify: "not_checked", ink, checkedAt: null,
      } }));
      expect(t).not.toContain("Connected");
      expect(t).toContain(ink === "setup" ? "Setup incomplete" : "Not checked");
    }
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
