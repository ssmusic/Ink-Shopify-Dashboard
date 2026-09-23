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

const { default: InkOnboarding } = await import("../routes/app.ink._index");
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

describe("the onboarding screen", () => {
  it("says it is setting up while the install lands", () => {
    const html = render(InkOnboarding, { stage: "provisioning", mark: null, brandName: "Made-Up Goods", confirmedAt: null, captureNote: null, canRecapture: false });
    expect(text(html)).toContain("Setting up your store");
    expect(html).not.toContain("Use this");
  });

  it("says it is looking while the capture is in flight", () => {
    const html = render(InkOnboarding, { stage: "capturing", mark: null, brandName: "Made-Up Goods", confirmedAt: null, captureNote: null, canRecapture: true });
    expect(text(html)).toContain("Looking for your mark");
  });

  it("shows the captured mark with 'Use this' and 'Look again'", () => {
    const html = render(InkOnboarding, { stage: "ready", mark: "https://cdn.test/mark.svg", brandName: "Made-Up Goods", confirmedAt: null, captureNote: "mark captured: https://cdn.test/mark.svg", canRecapture: true });
    expect(html).toContain('src="https://cdn.test/mark.svg"');
    expect(text(html)).toContain("Use this");
    expect(text(html)).toContain("Look again");
    expect(html).toContain('name="intent" value="use-mark"');
    expect(html).toContain('name="intent" value="recapture"');
  });

  it("sets the shop's name in type when no mark was found, and ships the upload disabled", () => {
    const html = render(InkOnboarding, { stage: "ready", mark: null, brandName: "Made-Up Goods", confirmedAt: null, captureNote: "the Worker answered but named no mark", canRecapture: true });
    expect(text(html)).toContain("Made-Up Goods");
    expect(text(html)).toContain("your name set in type");
    expect(html).toMatch(/<input[^>]*type="file"[^>]*disabled/);
  });

  it("reads 'Keep this' once the merchant has pressed", () => {
    const html = render(InkOnboarding, { stage: "ready", mark: "https://cdn.test/mark.svg", brandName: "x", confirmedAt: "2026-09-22T00:00:00Z", captureNote: null, canRecapture: true });
    expect(text(html)).toContain("Keep this");
    expect(text(html)).toContain("Every order is being recorded");
  });

  it("leaks no PLACEHOLDER marker into what the merchant reads", () => {
    for (const stage of ["provisioning", "capturing", "ready"]) {
      const html = render(InkOnboarding, { stage, mark: null, brandName: "x", confirmedAt: null, captureNote: null, canRecapture: true });
      // The one deliberate exception: the upload field says it is not built yet.
      expect(text(html).replace("PLACEHOLDER: the upload door is not built yet.", "")).not.toContain("PLACEHOLDER");
    }
  });
});

describe("the onboarding screen links out (day-one defect, 2026-09-22)", () => {
  const READY = { stage: "ready", mark: null, brandName: "x", confirmedAt: null, captureNote: null, canRecapture: true };

  it("offers the dashboard, signed in, at every stage", () => {
    for (const stage of ["provisioning", "capturing", "ready"]) {
      const html = render(InkOnboarding, { ...READY, stage });
      expect(text(html)).toContain("Open your dashboard");
    }
  });

  const PROOF = "proof_b3ea86a2c6aa96d2d4ee1e8b";
  const detail = (over: Record<string, unknown> = {}) => ({
    id: "2", orderNumber: "#1002", customerName: "Made Up", customerEmail: "buyer@example.com",
    customerAddress: { address1: "1 Test St", city: "Brooklyn", provinceCode: "NY", zip: "11201" },
    date: "Sep 21, 2026", total: "58.00", subtotal: "58.00", currency: "USD", status: "enrolled",
    items: [{ title: "Bar Tape", quantity: 2, price: "29.00", sku: "BT-1" }], metafields: {}, ...over,
  });
  const rows = [
    { id: "gid://shopify/Order/2", name: "#1002", createdAt: null, recordUrl: `https://www.in.ink/verify/${PROOF}`, proofId: PROOF, detail: detail(), door: { offerLine: "Get the record — $29", purchase: null } },
    { id: "gid://shopify/Order/1", name: "#1001", createdAt: null, recordUrl: null, proofId: null, detail: detail({ id: "1", orderNumber: "#1001", customerName: "Guest", customerEmail: "", status: "pending", items: [] }), door: { offerLine: null, purchase: null } },
  ];

  it("lists recent orders the way the Ritualist lists shipments — Order · Customer · Date · Total · Status", () => {
    const html = render(InkOnboarding, { ...READY, recentOrders: rows });
    const t = text(html);
    for (const heading of ["Order", "Customer", "Date", "Total", "Status"]) expect(t).toContain(heading);
    expect(t).toContain("#1002");
    expect(t).toContain("Made Up");
    expect(t).toContain("buyer@example.com");
    expect(t).toContain("Sep 21, 2026");
    expect(t).toContain("$58.00");
    expect(t).toContain("Enrolled");
    expect(t).toContain("#1001");
    expect(t).toContain("Pending");
    // Collapsed until clicked: the accordion's contents are not drawn yet.
    expect(t).not.toContain("Get the record");
  });

  it("opens a row into the Ritualist's panel with the record's door at the bottom", () => {
    const html = renderToString(
      <AppProvider i18n={translations}>
        {(() => {
          const Stub = createRoutesStub([{ id: "screen", path: "/", Component: () => <InkRecentOrders orders={rows} defaultExpandedId="gid://shopify/Order/2" /> }]);
          return <Stub initialEntries={["/"]} />;
        })()}
      </AppProvider>,
    );
    const t = text(html);
    // The Ritualist's panel: customer, products, delivery.
    expect(t).toContain("CUSTOMER");
    expect(t).toContain("1 Test St");
    expect(t).toContain("PRODUCTS");
    expect(t).toContain("Bar Tape");
    expect(t).toContain("DELIVERY");
    // ink's header button opens the public record, not the Ritualist's detail view.
    expect(t).toContain("View Full Record");
    expect(html).toContain(`href="https://www.in.ink/verify/${PROOF}"`);
    // Never the Ritualist's studio sentence under ink.
    expect(t).not.toContain("Ritualist studio");
    // The door is the LAST thing in the accordion — after the delivery column.
    expect(t).toContain("Get the record — $29");
    expect(t.lastIndexOf("Get the record — $29")).toBeGreaterThan(t.indexOf("DELIVERY"));
    expect(t).toContain("View record");
  });

  it("says an order has no record yet at the bottom of its accordion", () => {
    const html = renderToString(
      <AppProvider i18n={translations}>
        {(() => {
          const Stub = createRoutesStub([{ id: "screen", path: "/", Component: () => <InkRecentOrders orders={rows} defaultExpandedId="gid://shopify/Order/1" /> }]);
          return <Stub initialEntries={["/"]} />;
        })()}
      </AppProvider>,
    );
    expect(text(html)).toContain("No record yet");
    expect(text(html)).not.toContain("Get the record");
  });

  it("says there are no orders when the read found none", () => {
    expect(text(render(InkOnboarding, READY))).toContain("No orders yet");
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
    const onboarding = render(InkOnboarding, { stage: "ready", mark: "https://cdn.test/mark.svg", brandName: "Made-Up Goods", confirmedAt: null, captureNote: null, canRecapture: true });
    expect(text(onboarding).toLowerCase()).not.toContain("flash");
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
