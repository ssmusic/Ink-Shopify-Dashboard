// BILLING SAYS THE PLAN AS SHOPIFY HAS IT (Sam, 2026-09-24, on "Your Shopify
// plan is Free.": "get rid of that").
//   · The page reads the store's active subscription from Shopify
//     (currentAppInstallation.activeSubscriptions) and says each plan's name
//     and price lines as Shopify prices them — never a price of its own.
//   · A failed read is said as one; no plan is said as none; neither is "Free".
//   · The Dashboard draws no plan card (ritualist-dashboard.test.tsx).
// Made-up shop and plans: this repository is public.
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../firestore.server", () => ({ default: {}, firestore: {}, app: {} }));
vi.mock("../shopify.server", () => ({ authenticate: { admin: vi.fn() } }));

const { authenticate } = await import("../shopify.server");
const { PLAN_QUERY, plansFromBody } = await import("../services/ritualist-plan.server");
const route = await import("../routes/app.billing");
const Billing = route.default;

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

const BODY = {
  data: {
    currentAppInstallation: {
      activeSubscriptions: [
        {
          name: "Studio",
          currentPeriodEnd: "2026-10-24T00:00:00Z",
          lineItems: [
            { plan: { pricingDetails: { __typename: "AppRecurringPricing", interval: "EVERY_30_DAYS", price: { amount: "49.0", currencyCode: "USD" } } } },
            { plan: { pricingDetails: { __typename: "AppUsagePricing", terms: "$0.10 per recorded order", cappedAmount: { amount: "100.0", currencyCode: "USD" } } } },
          ],
        },
      ],
    },
  },
};

const load = (graphql: ReturnType<typeof vi.fn>) => {
  vi.mocked(authenticate.admin).mockResolvedValue({ admin: { graphql } } as never);
  return route.loader({ request: new Request("https://example.test/app/billing"), params: {}, context: {} } as never) as Promise<any>;
};

function renderHtml(loaderData: Record<string, unknown>) {
  const Stub = createRoutesStub([
    { id: "screen", path: "/", Component: () => <AppProvider i18n={translations}><Billing /></AppProvider> },
  ]);
  return renderToString(<Stub initialEntries={["/"]} hydrationData={{ loaderData: { screen: loaderData } }} />);
}

function render(loaderData: Record<string, unknown>) {
  const Stub = createRoutesStub([
    { id: "screen", path: "/", Component: () => <AppProvider i18n={translations}><Billing /></AppProvider> },
  ]);
  return text(renderToString(<Stub initialEntries={["/"]} hydrationData={{ loaderData: { screen: loaderData } }} />));
}

describe("what Billing reads", () => {
  it("asks Shopify for the store's active subscription and says each price as Shopify prices it", async () => {
    const graphql = vi.fn(async () => ({ json: async () => BODY }));
    const data = await load(graphql);
    expect(graphql).toHaveBeenCalledWith(PLAN_QUERY);
    expect(data.plans).toEqual([
      { name: "Studio", lines: ["$49.00 every 30 days", "$0.10 per recorded order", "Usage up to $100.00"], test: false, trialEnd: null, periodEnd: "2026-10-24T00:00:00Z" },
    ]);
  });

  it("says a failed read as unavailable and never throws the page", async () => {
    const data = await load(vi.fn(async () => { throw new Error("Shopify down"); }));
    expect(data.plans).toBeNull();
    expect(plansFromBody({ errors: [{ message: "nope" }] })).toBeNull();
  });

  it("an active list with nothing in it is no plan, not a failure", () => {
    expect(plansFromBody({ data: { currentAppInstallation: { activeSubscriptions: [] } } })).toEqual([]);
  });

  it("never names a plan Shopify did not name", () => {
    const [plan] = plansFromBody({ data: { currentAppInstallation: { activeSubscriptions: [{ lineItems: [] }] } } })!;
    expect(plan.name).toBe("");
  });

  const now = Date.parse("2026-09-26T12:00:00Z");
  const subscription = (fields: Record<string, unknown>, developmentStore = false) => ({
    data: {
      shop: { plan: { partnerDevelopment: developmentStore } },
      currentAppInstallation: { activeSubscriptions: [{
        ...BODY.data.currentAppInstallation.activeSubscriptions[0],
        ...fields,
      }] },
    },
  });

  it("uses Shopify's test flag or explicit development-store designation, never a zero-price guess", () => {
    expect(plansFromBody(subscription({ test: true }), now)?.[0].test).toBe(true);
    expect(plansFromBody(subscription({ test: false }, true), now)?.[0].test).toBe(true);
    const zeroPrice = { lineItems: [{ plan: { pricingDetails: { __typename: "AppRecurringPricing", interval: "EVERY_30_DAYS", price: { amount: "0", currencyCode: "USD" } } } }] };
    expect(plansFromBody(subscription({ ...zeroPrice, test: false }), now)?.[0].test).toBe(false);
  });

  it("calculates the actual trial end from creation and trial days, independently of the billing period", () => {
    const [plan] = plansFromBody(subscription({
      createdAt: "2026-09-25T15:13:00Z", trialDays: 45, currentPeriodEnd: "2026-12-09T15:13:00Z",
    }), now)!;
    expect(plan.trialEnd).toBe("2026-11-09T15:13:00.000Z");
    expect(plan.periodEnd).toBe("2026-12-09T15:13:00Z");
  });

  it("does not label expired, missing, or malformed trial data as an active trial", () => {
    for (const fields of [
      { createdAt: "2026-07-01T00:00:00Z", trialDays: 45 },
      { createdAt: "2026-09-25T00:00:00Z", trialDays: 0 },
      { createdAt: "not-a-date", trialDays: 45 },
      { trialDays: 45 },
      { createdAt: "2026-09-25T00:00:00Z", trialDays: "45" },
    ]) expect(plansFromBody(subscription(fields), now)?.[0].trialEnd).toBeNull();
  });
});

describe("what Billing draws", () => {
  it("the plan, its prices and its period, and where charges live", () => {
    const t = render({ plans: [{ name: "Studio", lines: ["$49.00 every 30 days"], periodEnd: "2026-10-24T00:00:00Z" }] });
    for (const part of ["Billing", "Your plan", "Studio", "$49.00 every 30 days", "This period ends Oct 24, 2026.", "Plans are chosen and approved in Shopify"]) expect(t).toContain(part);
  });

  it("identifies a test subscription without presenting its zero price as the live plan price", () => {
    const t = render({ plans: [{ name: "Starter", test: true, lines: ["$0.00 every 30 days"], trialEnd: "2026-11-09T15:13:00.000Z", periodEnd: "2026-11-09T15:13:00Z" }] });
    expect(t).toContain("Test subscription. No real charge.");
    expect(t).toContain("Trial ends Nov 9, 2026.");
    expect(t).toContain("Live-store pricing is shown on Shopify's plan page.");
    expect(t).not.toContain("$0.00");
    expect(t).not.toContain("This period ends");
    expect(t).not.toContain("charges appear on your Shopify invoice");
  });

  it("keeps Shopify's live plan price and distinguishes its trial from a billing period", () => {
    const t = render({ plans: [{ name: "Starter", test: false, lines: ["$299.00 every 30 days"], trialEnd: "2026-11-09T15:13:00.000Z", periodEnd: "2026-12-09T15:13:00Z" }] });
    expect(t).toContain("Trial ends Nov 9, 2026.");
    expect(t).toContain("After the trial: $299.00 every 30 days");
    expect(t).not.toContain("Test subscription");
    expect(t).not.toContain("This period ends");
  });

  it("never says Free — not for no plan, not for a failed read", () => {
    const none = render({ plans: [] });
    expect(none).toContain("No plan is active for this store.");
    const failed = render({ plans: null });
    expect(failed).toContain("Your plan could not be read from Shopify. Refresh to try again.");
    for (const t of [none, failed]) {
      expect(t).not.toMatch(/\bFree\b/);
      expect(t).not.toContain("Billing stays in Shopify");
    }
  });

  // THE PLAN DEAD END (audit 2026-09-25): an order whose record needs a plan
  // links here, so "no plan" must never be the end of the page.
  it("with no plan, offers the way to start one: Shopify's plan page when the app names it, else a refresh, never support", () => {
    const withPage = render({ plans: [], planPageUrl: "https://admin.shopify.com/store/example/charges/the-app/pricing_plans" });
    expect(withPage).toContain("Choose a plan");
    expect(renderHtml({ plans: [], planPageUrl: "https://admin.shopify.com/store/example/charges/the-app/pricing_plans" })).toContain('href="https://admin.shopify.com/store/example/charges/the-app/pricing_plans"');
    const withoutPage = render({ plans: [], planPageUrl: null });
    expect(withoutPage).not.toContain("Choose a plan");
    expect(renderHtml({ plans: [], planPageUrl: null })).not.toContain("mailto:");
    expect(withoutPage).not.toContain("support@in.ink");
    expect(withoutPage).toContain("Refresh to try again.");
  });

  it("builds Shopify's plan page only from a real handle and store, never a guess", () => {
    expect(route.planPageUrl("example.myshopify.com", "the-app")).toBe("https://admin.shopify.com/store/example/charges/the-app/pricing_plans");
    expect(route.planPageUrl("example.myshopify.com", null)).toBeNull();
    expect(route.planPageUrl(null, "the-app")).toBeNull();
    expect(route.planPageUrl("example.myshopify.com", "bad handle/..")).toBeNull();
  });

  it("reads the app's handle from Shopify, and a failed read is null", async () => {
    expect(await route.readAppHandle({ graphql: async () => ({ json: async () => ({ data: { currentAppInstallation: { app: { handle: "the-app" } } } }) }) })).toBe("the-app");
    expect(await route.readAppHandle({ graphql: async () => { throw new Error("down"); } })).toBeNull();
  });
});
