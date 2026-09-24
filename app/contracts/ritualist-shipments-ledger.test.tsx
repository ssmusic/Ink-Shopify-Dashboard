// SHIPMENTS IS INK'S ORDERS LEDGER (Sam, 2026-09-24: "we are making the
// ritualist as good as ink" · "it has to mirror the ritualist webapp").
// Rendered with the loader data it gets, inside the Polaris provider. Pinned:
//   · the title stays "Shipments" (until Sam names the screen for both apps);
//   · one table on thin lines under ink's column words — Order · Recipient ·
//     Activity · Total · Date — each row the order and what was bought, who it
//     went to, the opens and the rail's furthest step with its source, the
//     total and the date; no status tabs, no status badges, no Customer column;
//   · Shopify's search and sort; twenty to a page, paged;
//   · one line for no orders, for no match, and for a failed read.
// Made-up shop and orders: this repository is public.
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../firestore.server", () => ({ default: {}, firestore: {}, app: {} }));
vi.mock("../shopify.server", () => ({ authenticate: { admin: vi.fn() } }));

const { default: Shipments } = await import("../routes/app.tagged-shipments._index");
const { timelineFrom } = await import("../services/ink-timeline.server");

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

const PROOF = "proof_000000000000000000a10420";
const RECORD = {
  summary: { order_number: "#1042", opens: 1, first_open_at: "2026-09-22T19:00:00.000Z" },
  elements: [{ element: "delivery_date", label: "Delivery date", status: "attested", value: { delivered_at: "2026-09-22T18:00:00.000Z", source: "merchant" } }],
  locked: false,
  whole: true,
  forSale: null,
};
const TIMELINE = timelineFrom(
  { proof_id: PROOF, enrolled_at: "2026-09-20T15:01:00.000Z", delivered_at: "2026-09-22T18:00:00.000Z", delivery_source: "merchant", first_tap_at: "2026-09-22T19:00:00.000Z" },
  null,
  RECORD as never,
);
const DOOR = { offerLine: null, pending: false, paidPendingRecord: false, resumeUrl: null, downloadable: true, inHistory: false, purchase: null };
const detail = (over: Record<string, unknown> = {}) => ({
  id: "1042", orderNumber: "#1042", customerName: "Gift Recipient", customerEmail: "order@example.com",
  customerAddress: { address1: "1 Test St", city: "Brooklyn", provinceCode: "NY", zip: "11201" },
  date: "Sep 20, 2026", total: "58.00", subtotal: "58.00", currency: "USD", status: "pending",
  items: [{ title: "Bar Tape", quantity: 2, price: "29.00", sku: "BT-1" }], metafields: {}, ...over,
});
const ORDERS = [
  { id: "gid://shopify/Order/1042", name: "#1042", proofId: PROOF, detail: detail(), record: RECORD, door: DOOR, timeline: TIMELINE },
  { id: "gid://shopify/Order/1041", name: "#1041", proofId: null, detail: detail({ id: "1041", orderNumber: "#1041" }), record: null, door: { ...DOOR, downloadable: false }, timeline: null },
];

function render(loaderData: Record<string, unknown>) {
  const Stub = createRoutesStub([
    {
      id: "screen",
      path: "/",
      Component: () => (
        <AppProvider i18n={translations}>
          <Shipments />
        </AppProvider>
      ),
    },
  ]);
  return renderToString(
    <Stub
      initialEntries={["/"]}
      hydrationData={{ loaderData: { screen: { orders: [], pageInfo: null, ordersError: false, search: "", sort: "newest", ...loaderData } } }}
    />,
  );
}

describe("Shipments, as ink's Orders ledger", () => {
  it("keeps its title and draws ink's ledger: its words, its search, its columns", () => {
    const html = render({ orders: ORDERS });
    const t = text(html);
    for (const part of ["Shipments", "Recent orders", "Orders from the past 60 days.", "Refresh", "Order", "Recipient", "Activity", "Total", "Date"]) expect(t).toContain(part);
    expect(html).toContain('placeholder="Order number, name or email"');
  });

  it("says each order on one row: the order and what was bought, the recipient, the activity with its source, the total, the date", () => {
    const t = text(render({ orders: ORDERS }));
    const row = ["#1042", "Bar Tape", "Gift Recipient", "order@example.com", "1 open", "Delivered · From Shopify's fulfillment", "$58.00", "Sep 20, 2026"];
    let at = t.indexOf("#1042");
    for (const part of row) {
      const next = t.indexOf(part, at);
      expect(next, part).toBeGreaterThanOrEqual(at);
      at = next;
    }
  });

  it("has no status tabs, no status badges and no Customer column", () => {
    const t = text(render({ orders: ORDERS }));
    for (const gone of ["All (", "Enrolled (", "Distance recorded (", "Expired (", "Customer", "Pending", "Enrolled"]) expect(t).not.toContain(gone);
  });

  it("offers no price and no purchase anywhere on the list", () => {
    const t = text(render({ orders: ORDERS }));
    for (const gone of ["Get the record", "$29"]) expect(t).not.toContain(gone);
  });

  it("pages twenty at a time", () => {
    const html = render({ orders: ORDERS, pageInfo: { hasNextPage: true, hasPreviousPage: false, startCursor: "c1", endCursor: "c2" } });
    expect(html).toContain("Polaris-Pagination");
    expect(render({ orders: ORDERS })).not.toContain("Polaris-Pagination");
  });

  it("says no orders, no match and a failed read in one line each", () => {
    expect(text(render({ orders: [] }))).toContain("No orders are available from the past 60 days.");
    const none = text(render({ orders: [], search: "missing" }));
    expect(none).toContain("No orders match this search.");
    expect(none).toContain("Clear search");
    const failed = text(render({ orders: [], ordersError: true }));
    expect(failed).toContain("Orders could not be loaded. Refresh to try again.");
    expect(failed).not.toContain("No orders are available");
  });
});
