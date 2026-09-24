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
      { name: "Studio", lines: ["$49.00 every 30 days", "$0.10 per recorded order", "Usage up to $100.00"], periodEnd: "2026-10-24T00:00:00Z" },
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
});

describe("what Billing draws", () => {
  it("the plan, its prices and its period, and where charges live", () => {
    const t = render({ plans: [{ name: "Studio", lines: ["$49.00 every 30 days"], periodEnd: "2026-10-24T00:00:00Z" }] });
    for (const part of ["Billing", "Your plan", "Studio", "$49.00 every 30 days", "This period ends Oct 24, 2026.", "Plans are chosen and approved in Shopify"]) expect(t).toContain(part);
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
});
