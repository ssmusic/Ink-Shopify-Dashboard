// THE LEDGER'S DATES (Sam, 2026-09-24: "we should have a predictable filter
// ---- last 60 days and all etc and a range of dates"). Both apps' Orders:
//   · the web app's presets, up to what Shopify lets the app read — Last 7
//     days, Last 30 days, Last 60 days — and custom dates, From and To;
//   · the dates live in the URL, so a refresh, a page and a new search keep
//     them, and both loaders hand them to Shopify's read
//     (services/ink-links.server.ts, lib/ink-order-search.ts);
//   · a dated list with nothing in it says so, never "the past 60 days";
//   · "Last 60 days" asks Shopify for nothing more, because neither app holds
//     read_all_orders. The two facts are pinned together: an app that gains
//     the scope needs its own "All time", and this test changes with it.
// Made-up shop and orders: this repository is public.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../firestore.server", () => ({ default: {}, firestore: {}, app: {} }));
vi.mock("../shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("../services/ink-api.server", () => ({ createRecordPurchase: vi.fn(), patchMerchant: vi.fn(), mintMagicToken: vi.fn(), readRecordPriceOrUnknown: vi.fn(async () => undefined) }));
vi.mock("../services/ink-merchant.server", () => ({
  readInkMerchant: vi.fn(async () => ({ doc: { ink_api_key: null } })),
  stageOf: vi.fn(() => "ready"),
}));
vi.mock("../services/ink-links.server", () => ({
  readRecentOrderPage: vi.fn(async () => ({ rows: [], pageInfo: null })),
}));
vi.mock("../services/ritualist-rows.server", () => ({
  ritualistApiKey: vi.fn(async () => null),
  ritualistRowRecord: vi.fn(),
}));

const { authenticate } = await import("../shopify.server");
const { readRecentOrderPage } = await import("../services/ink-links.server");
const { ALL_ORDER_DATES, ORDER_DATE_OPTIONS, shopifyOrderDates } = await import("../lib/ink-order-search");
const ritualist = await import("../routes/app.tagged-shipments._index");
const ink = await import("../routes/app.ink.$section");

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const text = (html: string) =>
  html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CUSTOM = { range: "custom", from: "2026-09-01", to: "2026-09-15" };
const BOUNDS = { min: "2026-07-25" };

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

function render(Component: React.ComponentType, loaderData: Record<string, unknown>) {
  const Stub = createRoutesStub([
    { id: "screen", path: "/", Component: () => <AppProvider i18n={translations}><Component /></AppProvider> },
  ]);
  return renderToString(<Stub initialEntries={["/"]} hydrationData={{ loaderData: { screen: loaderData } }} />);
}
const ritualistScreen = (over: Record<string, unknown> = {}) =>
  render(ritualist.default, { orders: [], pageInfo: null, ordersError: false, search: "", sort: "newest", dates: ALL_ORDER_DATES, dateBounds: BOUNDS, ...over });
const inkScreen = (over: Record<string, unknown> = {}) =>
  render(ink.default, { section: "orders", stage: "ready", recentOrders: [], ordersError: false, search: "", sort: "newest", pageInfo: null, dates: ALL_ORDER_DATES, dateBounds: BOUNDS, ...over });

describe("both apps' Orders read their dates from the URL and hand them to Shopify's read", () => {
  const signedIn = () =>
    vi.mocked(authenticate.admin).mockResolvedValueOnce({ admin: {}, session: { shop: "made-up-shop.myshopify.com" } } as never);

  it("the Ritualist's", async () => {
    signedIn();
    const out = (await ritualist.loader({
      request: new Request("https://app.test/app/tagged-shipments?q=%231042&sort=oldest&dates=custom&from=2026-09-01&to=2026-09-15"),
      params: {},
      context: {},
    } as never)) as { dates: unknown; dateBounds: { min: string } };
    expect(readRecentOrderPage).toHaveBeenLastCalledWith({}, expect.objectContaining({ first: 20, search: "#1042", sort: "oldest", dates: CUSTOM }));
    expect(out.dates).toEqual(CUSTOM);
    expect(out.dateBounds.min).toMatch(DAY);
  });

  it("ink's", async () => {
    signedIn();
    const out = (await ink.loader({
      request: new Request("https://app.test/app/ink/orders?dates=7d"),
      params: { section: "orders" },
      context: {},
    } as never)) as unknown as { data: { dates: unknown; dateBounds: { min: string } } };
    expect(readRecentOrderPage).toHaveBeenLastCalledWith({}, expect.objectContaining({ first: 20, dates: { range: "7d", from: null, to: null } }));
    expect(out.data.dates).toEqual({ range: "7d", from: null, to: null });
    expect(out.data.dateBounds.min).toMatch(DAY);
  });

  it("an address with no readable dates is the whole window", async () => {
    signedIn();
    await ritualist.loader({ request: new Request("https://app.test/app/tagged-shipments?dates=custom&from=nope"), params: {}, context: {} } as never);
    expect(readRecentOrderPage).toHaveBeenLastCalledWith({}, expect.objectContaining({ dates: ALL_ORDER_DATES }));
  });
});

describe("what the dates control draws, on both apps' Orders", () => {
  it("the presets and custom dates, the whole window chosen until another is", () => {
    for (const html of [ritualistScreen(), inkScreen()]) {
      for (const { value, label } of ORDER_DATE_OPTIONS) expect(html).toMatch(new RegExp(`<option value="${value}"[^>]*>${label}</option>`));
      expect(html).toMatch(/<option value="60d" selected="">Last 60 days<\/option>/);
      expect(html).not.toContain('type="date"');
    }
  });

  it("custom dates in the address draw From and To holding them, reaching back to Shopify's window, and Apply", () => {
    for (const html of [ritualistScreen({ dates: CUSTOM }), inkScreen({ dates: CUSTOM })]) {
      const t = text(html);
      for (const part of ["From", "To", "Apply"]) expect(t).toContain(part);
      expect(html).toMatch(/<option value="custom" selected="">Custom dates<\/option>/);
      expect(html.match(/type="date"/g)).toHaveLength(2);
      for (const attr of ['value="2026-09-01"', 'value="2026-09-15"', 'min="2026-07-25"', 'min="2026-09-01"']) expect(html).toContain(attr);
      // No last day: Chromium greys out a year that min and max both fix.
      const fields = html.match(/<input[^>]*type="date"[^>]*>/g) ?? [];
      expect(fields).toHaveLength(2);
      for (const field of fields) expect(field).not.toMatch(/\bmax=/);
    }
  });

  it("a preset draws no From and To", () => {
    const html = ritualistScreen({ dates: { range: "30d", from: null, to: null } });
    expect(html).toMatch(/<option value="30d" selected="">Last 30 days<\/option>/);
    expect(html).not.toContain('type="date"');
  });

  it("a dated list with nothing in it says so, never the past 60 days", () => {
    for (const screen of [ritualistScreen, inkScreen]) {
      const none = text(screen({ dates: { range: "7d", from: null, to: null } }));
      expect(none).toContain("No orders from these dates.");
      expect(none).not.toContain("No orders are available from the past 60 days.");
      expect(text(screen({ dates: CUSTOM, search: "missing" }))).toContain("No orders match this search on these dates.");
      expect(text(screen())).toContain("No orders are available from the past 60 days.");
    }
  });
});

describe("ink's line at the end of the list", () => {
  // The line (#176) says the list is every order from the past 60 days. That
  // is true only of the whole list: a search or narrower dates show some
  // (the cloud session's #177, carried with ink's older orders). Newest
  // first, the whole list ends on Load more instead, with no line
  // (contracts/ink-older-orders.test.tsx).
  const LINE = "That is every order from the past 60 days.";
  const ROW = { id: "gid://shopify/Order/1042", name: "#1042", proofId: null, createdAt: "2026-09-10T12:00:00Z", detail: null, more: new Promise(() => {}) };
  const lastPage = { hasNextPage: false, hasPreviousPage: false, startCursor: "c1", endCursor: "c1" };

  it("ends the whole list, and only the whole list", () => {
    expect(text(inkScreen({ recentOrders: [ROW], pageInfo: lastPage, sort: "oldest" }))).toContain(LINE);
    expect(text(inkScreen({ recentOrders: [ROW], pageInfo: lastPage, sort: "total_desc" }))).toContain(LINE);
    expect(text(inkScreen({ recentOrders: [ROW], pageInfo: lastPage }))).not.toContain(LINE);
    expect(text(inkScreen({ recentOrders: [ROW], pageInfo: lastPage, dates: { range: "7d", from: null, to: null } }))).not.toContain(LINE);
    expect(text(inkScreen({ recentOrders: [ROW], pageInfo: lastPage, dates: CUSTOM }))).not.toContain(LINE);
    expect(text(inkScreen({ recentOrders: [ROW], pageInfo: lastPage, search: "#1042" }))).not.toContain(LINE);
    expect(text(inkScreen({ recentOrders: [ROW], pageInfo: { ...lastPage, hasNextPage: true } }))).not.toContain(LINE);
  });
});

describe("Last 60 days is Shopify's whole window", () => {
  it("neither app asks for read_all_orders, so the whole window adds nothing to Shopify's read and no preset says All time", () => {
    for (const toml of ["shopify.app.toml", "shopify.app.ink.toml"]) expect(read(toml)).not.toMatch(/read_all_orders/);
    expect(shopifyOrderDates(ALL_ORDER_DATES, Date.now())).toBeNull();
    expect(ORDER_DATE_OPTIONS.map((o) => o.label)).not.toContain("All time");
  });
});
