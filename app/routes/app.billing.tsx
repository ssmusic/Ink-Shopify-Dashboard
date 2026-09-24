import { authenticate } from "../shopify.server";
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, BlockStack, Card, Text } from "@shopify/polaris";
import PolarisAppLayout from "../components/PolarisAppLayout";
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
  const { admin } = await authenticate.admin(request);
  // Never re-thrown (app.tagged-shipments._index.tsx tells why): a failed
  // read costs the plan's lines, said as one, never the page.
  const plans = await readRitualistPlans(admin);
  return { plans };
}

const date = (iso: string) => {
  const d = new Date(iso);
  // UTC, as Shopify sends it: the server's render and the browser's agree.
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

export default function BillingPage() {
  const { plans } = useLoaderData<typeof loader>();
  return (
    <PolarisAppLayout>
      <Page
        title="Billing"
        backAction={{ content: "Settings", url: "/app/settings" }}
      >
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
              <Text as="p">No plan is active for this store.</Text>
            ) : (
              plans.map((plan, i) => (
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
              ))
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
