// EACH SECTION OF ink HAS ITS OWN ADDRESS, AND THE ORDERS LIST DOES NOT WAIT
// FOR ITS SLOWEST RECORD — checked mechanically (Sam, 2026-09-24, on the Steve
// Madden test store: "orders was slow to open … its not represented in the left nav as a page -
// its dashboard?" · "the app is just sooooooo slow").
//
//   1. /app/ink and every older ?view= address redirect to the section's own
//      path, the rest of the query kept; an unknown section is refused before
//      anything is read.
//   2. The admin's left nav lists Orders with its own path, and no link ink
//      draws still points at a ?view= address — the nav marks by path, so a
//      query-only address lit Dashboard over the Orders screen.
//   3. The Orders route answers with Shopify's orders at once; each row's
//      record side is its own promise.
//   4. A streamed row draws at once — the order, the buyer, the total — and
//      its activity when its record lands; nothing says "unavailable" while
//      it is on its way.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PassThrough } from "node:stream";
import { renderToPipeableStream, renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import { describe, expect, it, vi } from "vitest";

vi.mock("../shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("../services/ink-api.server", () => ({ createRecordPurchase: vi.fn(), patchMerchant: vi.fn(), mintMagicToken: vi.fn(), readRecordPriceOrUnknown: vi.fn(async () => undefined) }));
vi.mock("../services/ink-record-history.server", () => ({ readInkRecordHistory: vi.fn(async () => ({ rows: [], page: 1, hasNext: false, hasPrevious: false })) }));
vi.mock("../services/ink-merchant.server", () => ({
  readInkMerchant: vi.fn(async () => ({ doc: { ink_api_key: null } })),
  stageOf: vi.fn(() => "ready"),
}));
vi.mock("../services/ink-links.server", () => ({
  readRecentOrderPage: vi.fn(async () => ({ rows: [], pageInfo: null })),
}));
vi.mock("../services/ink-kpis.server", () => ({ readInkKpis: vi.fn(async () => null) }));
vi.mock("../services/ink-delivery.server", () => ({ readDeliveryDashboard: vi.fn(async () => null) }));

const { loader: homeDoor } = await import("../routes/app.ink._index");
const { default: InkRecentOrders } = await import("../components/InkRecentOrders");
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

function redirectOf(url: string) {
  try {
    homeDoor({ request: new Request(url), params: {}, context: {} } as never);
  } catch (thrown) {
    if (thrown instanceof Response) return { status: thrown.status, location: thrown.headers.get("Location") };
    throw thrown;
  }
  return null;
}

describe("each section of ink has its own address", () => {
  it("sends /app/ink to Orders, and each older ?view= address to its section, the rest of the query kept", () => {
    expect(redirectOf("https://install.in.ink/app/ink")).toEqual({ status: 302, location: "/app/ink/orders" });
    expect(redirectOf("https://install.in.ink/app/ink?shop=a.myshopify.com&host=x")).toEqual({ status: 302, location: "/app/ink/orders?shop=a.myshopify.com&host=x" });
    expect(redirectOf("https://install.in.ink/app/ink?view=insights&host=x")).toEqual({ status: 302, location: "/app/ink/dashboard?host=x" });
    expect(redirectOf("https://install.in.ink/app/ink?view=records&page=2")).toEqual({ status: 302, location: "/app/ink/records?page=2" });
    expect(redirectOf("https://install.in.ink/app/ink?view=help")).toEqual({ status: 302, location: "/app/ink/help" });
    expect(redirectOf("https://install.in.ink/app/ink?view=nonsense")).toEqual({ status: 302, location: "/app/ink/orders" });
  });

  it("refuses an unknown section before it authenticates or reads anything", async () => {
    const { authenticate } = await import("../shopify.server");
    vi.mocked(authenticate.admin).mockClear();
    const { loader } = await import("../routes/app.ink.$section");
    await expect(loader({ request: new Request("https://install.in.ink/app/ink/nope"), params: { section: "nope" }, context: {} } as never)).rejects.toMatchObject({ status: 404 });
    expect(authenticate.admin).not.toHaveBeenCalled();
  });

  it("lists Orders in the admin's left nav with its own path, every item on a path of its own", () => {
    const app = read("app/routes/app.tsx");
    const nav = app.match(/<NavMenu>([\s\S]*?)<\/NavMenu>/)?.[1] ?? "";
    const links = [...nav.matchAll(/<a href="([^"]+)"( rel="home")?>([^<]+)<\/a>/g)].map((m) => ({ href: m[1], home: !!m[2], label: m[3] }));
    const items = links.filter((l) => !l.home);
    expect(items.map((l) => l.label)).toEqual(["Dashboard", "Orders", "Records", "Settings", "Help"]);
    expect(items.map((l) => l.href)).toEqual(["/app/ink/dashboard", "/app/ink/orders", "/app/ink/records", "/app/ink/settings", "/app/ink/help"]);
    for (const l of links) expect(l.href, l.label).not.toContain("?");
    expect(links.filter((l) => l.home)).toEqual([{ href: "/app/ink", home: true, label: "Orders" }]);
  });

  it("draws no link to a ?view= address anywhere in ink", () => {
    for (const f of [
      "app/routes/app.tsx",
      "app/routes/app.ink.$section.tsx",
      "app/routes/app.record.tsx",
      "app/routes/_index/route.tsx",
      "app/components/InkPillNav.tsx",
      "app/components/InkHelp.tsx",
      "app/components/InkSettingsView.tsx",
      "app/components/InkRecordHistory.tsx",
      "app/services/ink-billing.server.ts",
    ]) expect(read(f), f).not.toMatch(/\/app\/ink\?view=/);
  });
});

describe("the Orders list does not wait for its slowest record", () => {
  it("answers with Shopify's orders at once, each row's record side its own promise", async () => {
    const { authenticate } = await import("../shopify.server");
    const { readRecentOrderPage } = await import("../services/ink-links.server");
    vi.mocked(authenticate.admin).mockResolvedValueOnce({ admin: {}, session: { shop: "sample.myshopify.com" } } as never);
    vi.mocked(readRecentOrderPage).mockResolvedValueOnce({ rows: [{ id: "gid://shopify/Order/9", name: "#1099", proofId: null, detail: null }], pageInfo: null } as never);
    const { loader } = await import("../routes/app.ink.$section");
    const out = (await loader({ request: new Request("https://install.in.ink/app/ink/orders"), params: { section: "orders" }, context: {} } as never)) as { data: { recentOrders: Array<Record<string, unknown>> } };
    const row = out.data.recentOrders[0];
    expect(row).toMatchObject({ id: "gid://shopify/Order/9", name: "#1099", proofId: null, detail: null });
    expect(row).not.toHaveProperty("record");
    expect(row.more).toBeInstanceOf(Promise);
    await expect(row.more).resolves.toEqual({
      record: null,
      door: { offerLine: null, pending: false, paidPendingRecord: false, resumeUrl: null, downloadable: false, inHistory: false, purchase: null },
      packet: null,
      timeline: null,
    });
  });

  const detail = { id: "3", orderNumber: "#1011", customerName: "Made Up", customerEmail: "buyer@example.com", customerAddress: null, date: "Aug 21, 2026", total: "42.00", subtotal: "42.00", currency: "USD", status: "enrolled", items: [{ title: "Bar Tape", quantity: 1, price: "42.00", sku: "BT-1" }], metafields: {} };
  const RECORD = { proof_id: "proof_aec827b527fb30457c1da891", locked: false, whole: true, summary: { order_number: "#1011", opens: 3 }, elements: [], checks: null } as never;
  const ledger = (orders: unknown[]) => {
    const Stub = createRoutesStub([{ id: "screen", path: "/", Component: () => <InkRecentOrders orders={orders as never} /> }]);
    return (
      <AppProvider i18n={translations}>
        <Stub initialEntries={["/"]} />
      </AppProvider>
    );
  };

  it("draws a streamed row at once: the order, its buyer and total now, a placeholder where its activity will be", () => {
    const html = renderToString(ledger([{ id: "gid://shopify/Order/3", name: "#1011", proofId: "proof_aec827b527fb30457c1da891", detail, more: new Promise(() => {}) }]));
    const t = text(html);
    for (const part of ["#1011", "Bar Tape", "Made Up", "buyer@example.com", "$42.00", "Aug 21, 2026"]) expect(t, part).toContain(part);
    expect(t).not.toContain("Opens unavailable");
    expect(t).not.toContain("3 opens");
    expect(html).toContain("Polaris-SkeletonBodyText");
  });

  it("fills the row's activity when its record lands", async () => {
    const more = Promise.resolve({ record: RECORD, door: { offerLine: null, purchase: null }, packet: null, timeline: null });
    // The whole stream, once every boundary has resolved — what a browser has
    // after the row's record lands.
    const html = await new Promise<string>((done, fail) => {
      const chunks: Buffer[] = [];
      const sink = new PassThrough().on("data", (c: Buffer) => chunks.push(c)).on("end", () => done(Buffer.concat(chunks).toString("utf8")));
      const { pipe } = renderToPipeableStream(ledger([{ id: "gid://shopify/Order/3", name: "#1011", proofId: "proof_aec827b527fb30457c1da891", detail, more }]), {
        onAllReady: () => pipe(sink),
        onError: fail,
      });
    });
    const t = text(html);
    expect(t).toContain("#1011");
    expect(t).toContain("3 opens");
  });
});

describe("the Dashboard's Location shared", () => {
  const KPIS = { recorded: 488, opened: 25, openRate: 5, locationShared: 3, capped: false };
  const load = async () => {
    const { authenticate } = await import("../shopify.server");
    vi.mocked(authenticate.admin).mockResolvedValueOnce({ admin: {}, session: { shop: "sample.myshopify.com" } } as never);
    const { loader } = await import("../routes/app.ink.$section");
    return ((await loader({ request: new Request("https://install.in.ink/app/ink/dashboard"), params: { section: "dashboard" }, context: {} } as never)) as { data: { kpis: typeof KPIS | null } }).data.kpis;
  };

  it("counts the orders with an open that shared a location — the funnel's own count, not a first open's alone", async () => {
    const { readInkKpis } = await import("../services/ink-kpis.server");
    const { readDeliveryDashboard } = await import("../services/ink-delivery.server");
    vi.mocked(readInkKpis).mockResolvedValueOnce(KPIS as never);
    vi.mocked(readDeliveryDashboard).mockResolvedValueOnce({ locationShared: 16 } as never);
    expect(await load()).toEqual({ ...KPIS, locationShared: 16 });
  });

  it("keeps the insights' own number when the delivery rows are unavailable", async () => {
    const { readInkKpis } = await import("../services/ink-kpis.server");
    const { readDeliveryDashboard } = await import("../services/ink-delivery.server");
    vi.mocked(readInkKpis).mockResolvedValueOnce(KPIS as never);
    vi.mocked(readDeliveryDashboard).mockResolvedValueOnce(null);
    expect(await load()).toEqual(KPIS);
  });
});

describe("Sam's second pass, 2026-09-24: downloads, Records, the Orders rows", () => {
  it("does not reload the list after a record's inspection or a file — a purchase still does", async () => {
    const { shouldRevalidate } = await import("../routes/app.ink.$section");
    const after = (intent: string, formAction = "/app/record") => {
      const formData = new FormData();
      formData.set("intent", intent);
      return shouldRevalidate({ formAction, formData, defaultShouldRevalidate: true } as never);
    };
    for (const read of ["inspect", "pdf", "csv", "download"]) expect(after(read), read).toBe(false);
    expect(after("buy")).toBe(true);
    expect(after("pdf", "/app/ink/settings")).toBe(true);
  });

  const records = async (price: unknown) => {
    const { authenticate } = await import("../shopify.server");
    const { readInkMerchant } = await import("../services/ink-merchant.server");
    const { readRecordPriceOrUnknown } = await import("../services/ink-api.server");
    const { readRecentOrderPage } = await import("../services/ink-links.server");
    vi.mocked(authenticate.admin).mockResolvedValueOnce({ admin: {}, session: { shop: "sample.myshopify.com" } } as never);
    vi.mocked(readInkMerchant).mockResolvedValueOnce({ doc: { ink_api_key: "own-key" }, shopId: "shop_1" } as never);
    vi.mocked(readRecordPriceOrUnknown).mockResolvedValueOnce(price as never);
    vi.mocked(readRecentOrderPage).mockResolvedValueOnce({ rows: [
      { id: "gid://shopify/Order/27", name: "#1027", proofId: "proof_aec827b527fb30457c1da027", createdAt: "2026-09-04T18:56:00Z", detail: null },
      { id: "gid://shopify/Order/25", name: "#1025", proofId: null, createdAt: "2026-08-29T10:00:00Z", detail: null },
    ], pageInfo: null } as never);
    const { loader } = await import("../routes/app.ink.$section");
    return ((await loader({ request: new Request("https://install.in.ink/app/ink/records"), params: { section: "records" }, context: {} } as never)) as { data: { includedRecords: unknown } }).data.includedRecords;
  };

  it("lists the recent records, each downloadable, on a store where the backend says the record is free — Records no longer only points back to Orders", async () => {
    expect(await records(null)).toEqual([
      { proofId: "proof_aec827b527fb30457c1da027", orderName: "#1027", createdAt: "2026-09-04T18:56:00Z", state: "included", door: { offerLine: null, downloadable: true }, record: null },
    ]);
  });

  it("lists none when the record is priced, or when the price could not be read", async () => {
    expect(await records({ price_cents: 2900, currency: "USD" })).toBeNull();
    expect(await records(undefined)).toBeNull();
  });

  const detail = (over: Record<string, unknown> = {}) => ({ id: "27", orderNumber: "#1027", customerName: "Made Up", customerEmail: "buyer@example.com", customerAddress: { address1: "1 Test St", city: "Dallas", provinceCode: "TX", zip: "75201", country: "United States" }, date: "Sep 4, 2026", total: "179.90", subtotal: "179.90", currency: "USD", status: "enrolled", items: [{ title: "Kimora Combat Boot", quantity: 1, price: "149.95", sku: "K-1" }, { title: "Laces", quantity: 2, price: "14.975", sku: "L-1" }], metafields: {}, ...over });
  const RECORD = { proof_id: "proof_aec827b527fb30457c1da027", locked: false, whole: true, summary: { order_number: "#1027", opens: 32 }, elements: [], checks: null };
  const TIMELINE = { steps: [], address: null, opens: [{ at: "2026-09-04T12:00:00Z" }, { at: "2026-09-05T02:00:00Z" }], window: null, lastOpen: { at: "2026-09-05T02:00:00Z", point: null, accuracy_m: null, distance_m: 40, device: "iPhone", address_words: "Somewhere" } };
  const row = { id: "gid://shopify/Order/27", name: "#1027", proofId: "proof_aec827b527fb30457c1da027", detail: detail(), record: RECORD, door: { offerLine: null, downloadable: true, purchase: null }, timeline: TIMELINE };
  const draw = (props: Record<string, unknown>) => {
    const Stub = createRoutesStub([{ id: "screen", path: "/", Component: () => <InkRecentOrders orders={[row] as never} {...props} /> }]);
    return renderToString(<AppProvider i18n={translations}><Stub initialEntries={["/"]} /></AppProvider>);
  };

  it("gives ink's rows a line more in each cell — the other items, where it ships, the last open and its device, the item count — and never where the open was", () => {
    const t = text(draw({ detailed: true }));
    for (const part of ["+1 more", "Dallas, TX", "3 items", "32 opens", "· iPhone"]) expect(t, part).toContain(part);
    expect(t).toMatch(/Last open Sep \d+, \d+:\d\d [AP]M · iPhone/);
    expect(t).not.toContain("Somewhere");
    expect(t).not.toMatch(/\b40 m\b/);
    expect(t).not.toContain("United States");
  });

  it("keeps every other ledger's rows as they were (the Ritualist's Shipments and Dashboard pass no option)", () => {
    const t = text(draw({}));
    for (const part of ["+1 more", "Dallas, TX", "3 items", "Last open"]) expect(t, part).not.toContain(part);
    expect(t).toContain("32 opens");
  });

  it("opens an order with Advanced closed on ink's Orders, and open everywhere else", () => {
    const closed = draw({ advancedOpen: false, defaultExpandedId: row.id });
    const open = draw({ defaultExpandedId: row.id });
    expect(closed).toContain('aria-expanded="false"');
    expect(text(closed)).not.toContain("Export the record");
    expect(text(open)).toContain("Export the record");
  });

  it("no longer lets a selection elsewhere on the page swallow a row's click — only text selected in that row", async () => {
    const { pressedTheRow } = await import("../components/InkRecentOrders");
    const inside = { id: "inside" }, elsewhere = { id: "elsewhere" };
    const rowEl = { contains: (n: unknown) => n === inside };
    const press = { target: { closest: () => null }, currentTarget: rowEl } as never;
    vi.stubGlobal("window", { getSelection: () => ({ toString: () => "buyer@example.com", anchorNode: elsewhere }) });
    expect(pressedTheRow(press)).toBe(true);
    vi.stubGlobal("window", { getSelection: () => ({ toString: () => "buyer@example.com", anchorNode: inside }) });
    expect(pressedTheRow(press)).toBe(false);
    vi.unstubAllGlobals();
  });
});
