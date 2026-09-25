import { authenticate } from "../shopify.server";
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, BlockStack, Box, Button, Card, InlineStack, Text } from "@shopify/polaris";
import PolarisAppLayout from "../components/PolarisAppLayout";
import RitualistPillNav from "../components/RitualistPillNav";
import { readRitualistPlans } from "../services/ritualist-plan.server";

// THE PLAN, AS SHOPIFY HAS IT (Sam, 2026-09-24, on "Your Shopify plan is
// Free.": "get rid of that"). This page used to say the app was free — true at
// the first App Store submission, untrue once the Ritualist is paid — through
// PlanCard and a second card; both claims are gone (PlanCard stays in the
// tree, drawn nowhere). The Ritualist keeps no price of its own: it reads the
// store's active subscription from Shopify and says it as Shopify has it
// (services/ritualist-plan.server.ts). A failed read says so, never "Free".
// The page is kept because /app/payment and /app/payment/callback redirect
// here. The mock cards before that — a hardcoded $233.22/$500 cap, a
// fabricated 47/31 cycle, a fake usage ledger — stay tabled in
// components/billing/. ⚠️ PLACEHOLDER COPY — every sentence is Sam's to word.

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  // Never re-thrown (app.tagged-shipments._index.tsx tells why): a failed
  // read costs the plan's lines, said as one, never the page.
  const [plans, handle] = await Promise.all([readRitualistPlans(admin), readAppHandle(admin)]);
  return { plans, planPageUrl: planPageUrl(session?.shop, handle) };
}

/** The app's handle, as Shopify names it (currentAppInstallation.app.handle;
 *  The Ritualist's is "ink-verified-delivery"). Read live on every open, so
 *  the plan page's address never depends on a stored setting. null when the
 *  read fails. */
export async function readAppHandle(admin: { graphql: (q: string) => Promise<{ json: () => Promise<any> }> }): Promise<string | null> {
  try {
    const res = await admin.graphql(`#graphql
      query RitualistAppHandle { currentAppInstallation { app { handle } } }`);
    const handle = (await res.json())?.data?.currentAppInstallation?.app?.handle;
    return typeof handle === "string" ? handle : null;
  } catch {
    return null;
  }
}

// WHERE A PLAN IS CHOSEN (2026-09-25). The Ritualist bills through Shopify
// App Pricing: three plans (Starter, Growth, Pro, each with a 45-day trial)
// on Shopify's own plan page, which returns the merchant to /app/billing.
// The page's address is built from this store and the app's handle as
// Shopify reports it; when either is unknown, the page says how else a plan
// is started instead of opening a Shopify 404.
export function planPageUrl(shop: string | null | undefined, handle: string | null | undefined): string | null {
  const h = typeof handle === "string" ? handle.trim() : "";
  const store = typeof shop === "string" ? shop.replace(/\.myshopify\.com$/, "") : "";
  if (!/^[a-z0-9][a-z0-9-]*$/.test(h) || !/^[a-z0-9][a-z0-9-]*$/.test(store)) return null;
  return `https://admin.shopify.com/store/${store}/charges/${h}/pricing_plans`;
}

// ⚠️ PLACEHOLDER — Sam's words replace these two lines.
export const NO_PLAN_LINE = "No plan is active for this store.";
export const NO_PLAN_PAGE_LINE = "Plans can't be chosen inside the app yet. Email support@in.ink to start one.";

const date = (iso: string) => {
  const d = new Date(iso);
  // UTC, as Shopify sends it: the server's render and the browser's agree.
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

export default function BillingPage() {
  const { plans, planPageUrl: choose } = useLoaderData<typeof loader>();
  return (
    <PolarisAppLayout>
      <Page fullWidth title="Billing">
        <Box paddingBlockEnd="400">
          <RitualistPillNav />
        </Box>
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Your plan
            </Text>
            {plans === null ? (
              <Text as="p" tone="subdued">
                Your plan could not be read from Shopify. Refresh to try again.
              </Text>
            ) : plans.length === 0 ? (
              <BlockStack gap="300">
                <Text as="p">{NO_PLAN_LINE}</Text>
                {choose ? (
                  <InlineStack>
                    <Button variant="primary" url={choose} target="_top">
                      Choose a plan
                    </Button>
                  </InlineStack>
                ) : (
                  <BlockStack gap="200">
                    <Text as="p" tone="subdued">{NO_PLAN_PAGE_LINE}</Text>
                    <InlineStack>
                      <Button url="mailto:support@in.ink" external>
                        Email support@in.ink
                      </Button>
                    </InlineStack>
                  </BlockStack>
                )}
              </BlockStack>
            ) : (
              <BlockStack gap="300">
                {plans.map((plan, i) => (
                  <BlockStack key={`${plan.name}-${i}`} gap="100">
                    {plan.name ? (
                      <Text as="p" fontWeight="semibold">
                        {plan.name}
                      </Text>
                    ) : null}
                    {plan.lines.map((line) => (
                      <Text as="p" key={line}>
                        {line}
                      </Text>
                    ))}
                    {plan.periodEnd && date(plan.periodEnd) ? (
                      <Text as="p" tone="subdued">
                        {`This period ends ${date(plan.periodEnd)}.`}
                      </Text>
                    ) : null}
                  </BlockStack>
                ))}
                {choose ? (
                  <InlineStack>
                    <Button url={choose} target="_top">Change plan</Button>
                  </InlineStack>
                ) : null}
              </BlockStack>
            )}
            <Text as="p" tone="subdued">
              Plans are chosen and approved in Shopify, and charges appear on
              your Shopify invoice.
            </Text>
          </BlockStack>
        </Card>
      </Page>
    </PolarisAppLayout>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
