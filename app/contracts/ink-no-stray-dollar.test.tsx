// NO STRAY "$" UNDER AN INK PAGE (2026-09-25, before the App Store screenshots).
//
// A "$" sat at the left edge under every ink page. Nothing in ink's source
// drew it: React's streaming script `$RC` did. React Router streams its data
// through a Suspense boundary that React 18 wrote AFTER `</html>`; the parser
// put the boundary's opening comment on the Document and its <template> into
// <body>, right after the newline Cloudflare adds with its analytics beacon
// before `</body>` on install.in.ink. `$RC` sets the template's previous
// sibling to "$", and that sibling was the newline
// (services/document-end.server.ts).
//
// Three laws pin it:
//   1. The server's document closes last: every boundary a streamed page
//      writes stays inside <body>, each <template> right after its own
//      opening comment, so `$RC` never writes into a node that isn't its own.
//   2. The closing tags survive being split across network chunks.
//   3. No ink screen, alone or inside the real layout, draws a text node that
//      is exactly "$" (a price like "$58.00" is one whole text node).

import { PassThrough, Readable } from "stream";
import { renderToString } from "react-dom/server";
import { createRequestHandler, createRoutesStub } from "react-router";
import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../shopify.server", () => ({ authenticate: { admin: vi.fn() }, registerWebhooks: vi.fn(), addDocumentResponseHeaders: vi.fn() }));
vi.mock("../services/ink-install.server", () => ({ captureInkMark: vi.fn(), readShopIdentity: vi.fn(), provisionInkMerchant: vi.fn() }));
vi.mock("../services/ink-merchant.server", () => ({
  readInkMerchant: vi.fn(), markOf: vi.fn(), brandNameOf: vi.fn(), stageOf: vi.fn(), flashForwardOf: vi.fn(),
  FLASH_FORWARDS: ["order_status", "carrier"],
}));
vi.mock("../services/merchant.server", () => ({ updateMerchant: vi.fn(), getMerchant: vi.fn() }));
vi.mock("../services/ink-api.server", () => ({ patchMerchant: vi.fn(), mintMagicToken: vi.fn(), createMerchant: vi.fn(), readRecordPriceOrUnknown: vi.fn() }));
vi.mock("../services/carrier-service.server", () => ({ ensureCarrierServiceRegistered: vi.fn() }));
vi.mock("../services/plan-precedence.server", () => ({ claimRitualistPlan: vi.fn() }));
vi.mock("../services/ritualist-plan-sync.server", () => ({ syncRitualistPlan: vi.fn() }));
vi.mock("../services/test-store-sync.server", () => ({ syncTestStore: vi.fn() }));

const { closeDocumentLast } = await import("../services/document-end.server");
const entry = await import("../entry.server");
const root = await import("../root");
const layout = await import("../routes/app");
const settings = await import("../routes/app.ink.settings");
const section = await import("../routes/app.ink.$section");

const DETAIL = {
  id: "2", orderNumber: "#1010", customerName: "Made Up", customerEmail: "buyer@example.com",
  customerAddress: { address1: "1 Test St", city: "Brooklyn", provinceCode: "NY", zip: "11201" },
  date: "Aug 20, 2026", total: "58.00", subtotal: "58.00", currency: "USD", status: "enrolled",
  items: [{ title: "Bar Tape", quantity: 2, price: "29.00", sku: "BT-1" }], metafields: {},
};
const ROW = { id: "gid://shopify/Order/2", name: "#1010", proofId: null, detail: DETAIL };
const SETTINGS_DATA = { ritualistUrl: "", privacy: [], connection: null, emailLine: null };
// Orders as its loader hands it over: the list at once, each record later.
const ordersData = () => ({
  section: "orders", stage: "ready",
  recentOrders: [{ ...ROW, more: new Promise((r) => setTimeout(() => r({ record: null, door: { offerLine: null, purchase: null } }), 20)) }],
});

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

/** Serve one ink page through the real server entry, as a document request. */
async function serve(leaf: "settings" | "orders"): Promise<string> {
  const leafId = leaf === "settings" ? "routes/app.ink.settings" : "routes/app.ink.$section";
  const leafPath = leaf === "settings" ? "ink/settings" : "ink/:section";
  const leafModule = leaf === "settings" ? { ...settings, loader: () => SETTINGS_DATA } : { ...section, loader: ordersData };
  const table = [
    { id: "root", parentId: undefined, path: "", module: { ...root, loader: () => ({ ink: true }) } },
    { id: "routes/app", parentId: "root", path: "app", module: { ...layout, loader: () => ({ apiKey: "k", flavor: "ink" }) } },
    { id: leafId, parentId: "routes/app", path: leafPath, module: leafModule },
  ];
  const build = {
    entry: { module: entry },
    routes: Object.fromEntries(table.map((r) => [r.id, r])),
    assets: {
      entry: { imports: [], module: "/entry.client.js" }, url: "/manifest.js", version: "1",
      routes: Object.fromEntries(table.map((r) => [r.id, {
        id: r.id, parentId: r.parentId, path: r.path, module: `/${r.id}.js`, imports: [],
        hasLoader: true, hasAction: false, hasClientLoader: false, hasClientAction: false, hasErrorBoundary: false,
      }])),
    },
    publicPath: "/", assetsBuildDirectory: "build/client", future: {}, ssr: true, isSpaMode: false, prerender: [],
    routeDiscovery: { mode: "initial", manifestPath: "/__manifest" }, basename: "/",
  };
  const handler = createRequestHandler(build as never, "production");
  const res = await handler(new Request(`https://app.test/app/ink/${leaf}`));
  expect(res.status).toBe(200);
  return res.text();
}

describe("the server's document closes last", () => {
  for (const leaf of ["settings", "orders"] as const) {
    it(`ink ${leaf}: every streamed boundary stays inside <body>, each template right after its own comment`, async () => {
      const html = await serve(leaf);
      // Nothing after the closing tags, and only one of them.
      expect(html.endsWith("</body></html>")).toBe(true);
      expect(html.split("</html>").length).toBe(2);
      // The page did stream: at least one boundary was completed by `$RC`.
      const templates = [...html.matchAll(/<template id="B:\d+"><\/template>/g)];
      expect(templates.length).toBeGreaterThan(0);
      expect(html).toContain("$RC(");
      for (const t of templates) {
        // What a proxy injects before `</body>` can no longer come between
        // them: `</body>` is after every one of them.
        expect(html.slice(0, t.index).endsWith("<!--$?-->")).toBe(true);
        expect(t.index!).toBeLessThan(html.indexOf("</body>"));
      }
      // Where Cloudflare's beacon now lands: after all of React's content.
      const injected = html.replace("</body>", "<script data-cf-beacon></script>\n</body>");
      expect(injected.lastIndexOf("$RC(")).toBeLessThan(injected.indexOf("data-cf-beacon"));
    });
  }
});

describe("closeDocumentLast", () => {
  async function through(chunks: (string | Buffer)[]): Promise<string> {
    const out = new PassThrough();
    const closing = closeDocumentLast();
    closing.pipe(out);
    const parts: Buffer[] = [];
    out.on("data", (c: Buffer) => parts.push(c));
    const done = new Promise((r) => out.on("end", r));
    Readable.from(chunks.map((c) => (typeof c === "string" ? Buffer.from(c) : c))).pipe(closing);
    await done;
    return Buffer.concat(parts).toString("utf8");
  }

  it("moves the closing tags to the end, even split across chunks and beside multi-byte text", async () => {
    const shell = "<html><body><p>café — ok</p></body></html>";
    const after = "<!--$?--><template id=\"B:0\"></template><!--/$--><script>$RC(\"B:0\",\"S:0\")</script>";
    const whole = shell + after;
    const expected = "<html><body><p>café — ok</p>" + after + "</body></html>";
    // Every split point, including inside "</body></html>" and inside "é".
    const bytes = Buffer.from(whole);
    for (let cut = 1; cut < bytes.length; cut++) {
      expect(await through([bytes.subarray(0, cut), bytes.subarray(cut)])).toBe(expected);
    }
    expect(await through([...whole].map((ch) => ch))).toBe(expected);
  });

  it("passes a document without closing tags through unchanged", async () => {
    expect(await through(["Unexpected ", "Server Error"])).toBe("Unexpected Server Error");
    expect(await through(["<p>a</p>", "</bo", "dy>"])).toBe("<p>a</p></body>");
  });
});

describe("no ink screen draws a lone \"$\"", () => {
  /** Every text node in an HTML string, scripts and styles left out. */
  const textNodes = (html: string) =>
    [...html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, "").matchAll(/>([^<]+)</g)]
      .map((m) => m[1].replace(/&#x27;/g, "'").replace(/&amp;/g, "&").trim())
      .filter(Boolean);
  const leaf = (Component: React.ComponentType, data: Record<string, unknown>) => {
    const Stub = createRoutesStub([{ id: "screen", path: "/", Component: () => <AppProvider i18n={translations}><Component /></AppProvider> }]);
    return renderToString(<Stub initialEntries={["/"]} hydrationData={{ loaderData: { screen: data } }} />);
  };
  const inLayout = (Component: React.ComponentType, data: Record<string, unknown>) => {
    const Stub = createRoutesStub([
      { id: "root", path: "/", Component: root.default, children: [
        { id: "routes/app", path: "app", Component: layout.default, children: [{ id: "leaf", path: "leaf", Component }] },
      ] },
    ]);
    return renderToString(
      <Stub initialEntries={["/app/leaf"]} hydrationData={{ loaderData: { root: { ink: true }, "routes/app": { apiKey: "k", flavor: "ink" }, leaf: data } }} />,
    );
  };
  const ORDERS = { section: "orders", stage: "ready", recentOrders: [{ ...ROW, record: null, door: { offerLine: null, purchase: null } }] };
  const SCREENS: [string, React.ComponentType, Record<string, unknown>][] = [
    ["Orders", section.default, ORDERS],
    ["Dashboard", section.default, { section: "insights", stage: "ready", kpis: null, delivery: null }],
    ["Records", section.default, { section: "records", stage: "ready", recordHistory: [], historyError: false, historyHasNext: false, historyHasPrevious: false }],
    ["Help", section.default, { section: "help", stage: null }],
    ["Settings", settings.default, SETTINGS_DATA],
  ];

  for (const [name, Component, data] of SCREENS) {
    it(`${name}, alone and inside ink's layout and document`, () => {
      for (const html of [leaf(Component, data), inLayout(Component, data)]) {
        const nodes = textNodes(html);
        expect(nodes.length).toBeGreaterThan(0);
        expect(nodes).not.toContain("$");
      }
    });
  }

  it("still shows a price whole: the rule is a lone \"$\", not every dollar sign", () => {
    expect(textNodes(leaf(section.default, ORDERS)).some((t) => t.includes("$58.00"))).toBe(true);
  });
});
