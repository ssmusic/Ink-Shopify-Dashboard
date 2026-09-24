// THE ORDERS LEDGER — the Ritualist's Orders page, in Polaris (Sam, 2026-09-24:
// "the orders page from the ritualist are sooooooo much better. i know we're
// polaris in the app but can we get something similar?").
//
// What the ledger promises (components/InkRecentOrders.tsx):
//   · column headings over one row per order: the order and what was bought ·
//     the recipient · the activity · the total · the date;
//   · the activity is the opens and the rail's own furthest step with where its
//     time came from (lib/order-activity.ts) — never a distance or a verdict;
//   · the whole row opens the order; its own buttons and a text selection do not;
//   · the Order, Total and Date headings sort, on Codex's own sort options;
//   · the open row is the quick glance first — what was bought, who it went to —
//     then the order's activity, then Advanced with the record's door at its top;
//   · twenty orders to a page.
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { deliveryLine, opensLine } from "../lib/order-activity";
import { lifecycle } from "../lib/order-timeline";

vi.mock("../shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("../services/ink-api.server", () => ({ createRecordPurchase: vi.fn(), patchMerchant: vi.fn(), mintMagicToken: vi.fn() }));
vi.mock("../services/ink-merchant.server", () => ({
  readInkMerchant: vi.fn(async () => ({ doc: { ink_api_key: null } })),
  stageOf: vi.fn(() => "ready"),
}));
vi.mock("../services/ink-links.server", () => ({
  readRecentOrderPage: vi.fn(async () => ({ rows: [], pageInfo: null })),
}));

const { default: InkRecentOrders, headingSort, pressedTheRow } = await import("../components/InkRecentOrders");
const { timelineFrom } = await import("../services/ink-timeline.server");

const text = (html: string) =>
  html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const JUDGED = /within|outside|beyond|\bnear\b|\bpass\b|flagged|range|default|Seen at the door|Confirmed at the door|verified at the door/i;
const COORDINATE = /-?\d{1,3}\.\d{4,}/;

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

// Corvara #1010's record words (GET /verify/:id, 2026-09-23), opened once 719 m away.
const RECORD = {
  locked: true,
  summary: { order_number: "#1010", buyer_initials: "SM", opens: 1, first_open_at: "2026-08-20T18:52:44.174Z" },
  elements: [
    { element: "order", label: "Order", status: "attested", value: { order_number: "#1010", enrolled_at: "2026-08-20T18:50:54.195Z" } },
    { element: "delivery_date", label: "Delivery date", status: "attested", value: { delivered_at: "2026-08-20T18:51:30.000Z", source: "merchant" } },
    { element: "the_open", label: "The open", status: "verified", value: { first_open_at: "2026-08-20T18:52:44.174Z", first_open_signed: true, opens: 1, signed_opens: 1, non_human_opens: 0, location: { verdict: "flagged", distance_m: 719, accuracy_m: 35, signed: false } } },
  ],
};
const TIMELINE = timelineFrom(
  { enrolled_at: "2026-08-20T18:50:54.195Z", delivered_at: "2026-08-20T18:51:30.000Z", delivery_source: "merchant", first_tap_at: "2026-08-20T18:52:44.174Z" },
  { address: { lat: 34, lng: -118 }, opens: [{ at: "2026-08-20T18:52:44.174Z", outcome: "success", gps_verdict: "flagged", distance_m: 719, accuracy_m: 35, lat: 34.005, lng: -118.004 }] },
  RECORD as never,
);
const detail = (over: Record<string, unknown> = {}) => ({
  id: "2", orderNumber: "#1010", customerName: "Made Up", customerEmail: "buyer@example.com",
  customerAddress: { address1: "1 Test St", city: "Brooklyn", provinceCode: "NY", zip: "11201" },
  date: "Aug 20, 2026", total: "58.00", subtotal: "58.00", currency: "USD", status: "enrolled",
  items: [{ title: "Bar Tape", quantity: 2, price: "29.00", sku: "BT-1" }], metafields: {}, ...over,
});
const ROWS = [
  { id: "gid://shopify/Order/2", name: "#1010", proofId: "proof_aec827b527fb30457c1da890", detail: detail(), record: RECORD, door: { offerLine: "Get the record ($29 USD)", purchase: null }, timeline: TIMELINE },
  { id: "gid://shopify/Order/1", name: "#1009", proofId: null, detail: null, record: null, door: { offerLine: null, purchase: null } },
];

function ledger(props: Record<string, unknown> = {}) {
  const Stub = createRoutesStub([{ id: "screen", path: "/", Component: () => <InkRecentOrders orders={ROWS as never} {...props} /> }]);
  return renderToString(
    <AppProvider i18n={translations}>
      <Stub initialEntries={["/"]} />
    </AppProvider>,
  );
}

describe("the Orders ledger: the Ritualist's page, in Polaris", () => {
  it("names its columns and says each order on one row: the order and what was bought, the recipient, the activity, the total, the date", () => {
    const t = text(ledger());
    for (const heading of ["Order", "Recipient", "Activity", "Total", "Date"]) expect(t).toContain(heading);
    const row = ["#1010", "Bar Tape", "Made Up", "buyer@example.com", "1 open", "Delivered · From Shopify's fulfillment", "$58.00", "Aug 20, 2026"];
    let at = t.indexOf("#1010");
    for (const part of row) {
      const next = t.indexOf(part, at);
      expect(next, part).toBeGreaterThanOrEqual(at);
      at = next;
    }
    expect(t).not.toContain("Customer");
  });

  it("keeps Codex's words for what an order does not carry", () => {
    const t = text(ledger());
    for (const part of ["#1009", "Recipient unavailable", "Email unavailable", "Opens unavailable", "Total unavailable", "Date unavailable"]) expect(t).toContain(part);
  });

  it("never puts a distance, a verdict or a coordinate on the row", () => {
    const t = text(ledger());
    expect(t).not.toContain("719");
    expect(t).not.toMatch(JUDGED);
    expect(t).not.toMatch(COORDINATE);
  });

  it("says the parcel's activity in the rail's own words, with where each time came from", () => {
    const at = "2026-09-01T00:00:00Z";
    const journey = (stage: string) => ({ events: [{ at, stage }] });
    expect(deliveryLine(lifecycle({ enrolled_at: at, delivered_at: at, delivered_source: "merchant" }))).toBe("Delivered · From Shopify's fulfillment");
    expect(deliveryLine(lifecycle({ enrolled_at: at, carrier_journey: journey("delivered") }))).toBe("Delivered · From the carrier's scan");
    expect(deliveryLine(lifecycle({ enrolled_at: at, delivered_at: at, delivered_source: "demo_clock" }))).toBe("Delivered · Set by the demo clock");
    expect(deliveryLine(lifecycle({ enrolled_at: at, carrier_journey: journey("transit") }))).toBe("In transit · From the carrier's scan");
    expect(deliveryLine(lifecycle({ enrolled_at: at, carrier_journey: journey("shipped") }))).toBe("Shipped · From the carrier's scan");
    // A delivered time nobody can source is not a delivery on the rail, so not on the row.
    expect(deliveryLine(lifecycle({ enrolled_at: at, delivered_at: at, delivered_source: "system" }))).toBe("Recorded by ink");
    expect(deliveryLine(lifecycle({}))).toBeNull();
    expect(deliveryLine(null)).toBeNull();
    expect([opensLine(0), opensLine(1), opensLine(3), opensLine(null)]).toEqual(["0 opens", "1 open", "3 opens", "Opens unavailable"]);
  });

  it("opens from anywhere on the row — but not from its own buttons, and not when text was selected", () => {
    const on = (control: boolean) => ({ target: { closest: () => (control ? {} : null) } }) as never;
    expect(pressedTheRow(on(false))).toBe(true);
    expect(pressedTheRow(on(true))).toBe(false);
    const html = ledger();
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="#1010"');
    expect(html).toContain('aria-controls="order-gid://shopify/Order/2"');
  });

  it("sorts from the Order, Total and Date headings, on Codex's own options, high to low first", () => {
    expect(headingSort("date", "newest")).toEqual({ active: "down", next: "oldest", nextLabel: "Oldest first" });
    expect(headingSort("date", "oldest")).toEqual({ active: "up", next: "newest", nextLabel: "Newest first" });
    expect(headingSort("total", "newest")).toEqual({ active: null, next: "total_desc", nextLabel: "Total, high to low" });
    expect(headingSort("total", "total_desc")).toEqual({ active: "down", next: "total_asc", nextLabel: "Total, low to high" });
    expect(headingSort("order", "number_asc")).toEqual({ active: "up", next: "number_desc", nextLabel: "Order number, high to low" });
    const html = ledger({ sort: "newest", onSort: () => {} });
    for (const label of ["Oldest first", "Total, high to low", "Order number, high to low"]) expect(html).toContain(`aria-label="${label}"`);
    // Without a sort to change, the headings are words, not buttons.
    expect(ledger()).not.toContain('aria-label="Oldest first"');
  });

  it("opens onto the quick glance first — what was bought and who it went to — then the order's activity, then Advanced with the record's door at its top", () => {
    const t = text(ledger({ defaultExpandedId: ROWS[0].id }));
    const order = ["Products", "Bar Tape", "BT-1 · Quantity 2", "$58.00", "Order total $58.00", "Recipient", "Order email: buyer@example.com", "1 Test St", "Order activity", "Advanced", "Get the record", "What this record contains"];
    let at = t.indexOf("Products");
    for (const part of order) {
      const next = t.indexOf(part, at);
      expect(next, part).toBeGreaterThanOrEqual(at);
      at = next;
    }
    expect(t).not.toContain("$29");
  });

  it("marks the open row with ink's one blue and its tint, never Polaris's info colour", () => {
    const html = ledger({ defaultExpandedId: ROWS[0].id });
    expect(html).toContain("box-shadow:inset 3px 0 0 #13ACF0");
    expect(html).toContain("background:rgba(19, 172, 240, 0.14)");
    expect(html).not.toMatch(/bg-fill-info|color-bg-surface-info|tone-info/);
    expect(ledger()).not.toContain("#13ACF0");
  });

  it("says an empty list and an empty search as one centred line", () => {
    const empty = (searching: boolean) =>
      renderToString(
        <AppProvider i18n={translations}>
          <InkRecentOrders orders={[]} searching={searching} />
        </AppProvider>,
      );
    expect(text(empty(false))).toContain("No orders are available from the past 60 days.");
    expect(text(empty(true))).toContain("No orders match this search.");
    expect(empty(false)).toContain("Polaris-Text--center");
  });
});

describe("the Orders route", () => {
  it("asks Shopify for twenty orders a page", async () => {
    const { authenticate } = await import("../shopify.server");
    const { readRecentOrderPage } = await import("../services/ink-links.server");
    vi.mocked(authenticate.admin).mockResolvedValueOnce({ admin: {}, session: { shop: "sample.myshopify.com" } } as never);
    const { loader } = await import("../routes/app.ink.$section");
    await loader({ request: new Request("https://app.test/app/ink/orders?q=%231010&sort=total_desc"), params: { section: "orders" }, context: {} } as never);
    expect(readRecentOrderPage).toHaveBeenCalledWith({}, expect.objectContaining({ first: 20, search: "#1010", sort: "total_desc" }));
  });
});
