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

  it("links each recent order to its public record, and says when an order has none yet", () => {
    const html = render(InkOnboarding, {
      ...READY,
      recentOrders: [
        { id: "gid://shopify/Order/2", name: "#1002", createdAt: null, recordUrl: "https://www.in.ink/verify/proof_b3ea86a2c6aa96d2d4ee1e8b" },
        { id: "gid://shopify/Order/1", name: "#1001", createdAt: null, recordUrl: null },
      ],
    });
    expect(text(html)).toContain("#1002");
    expect(html).toContain('href="https://www.in.ink/verify/proof_b3ea86a2c6aa96d2d4ee1e8b"');
    expect(text(html)).toContain("View record");
    expect(text(html)).toContain("#1001");
    expect(text(html)).toContain("No record yet");
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
});
