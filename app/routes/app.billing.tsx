import { authenticate } from "../shopify.server";
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, BlockStack, Card, Text } from "@shopify/polaris";
import PolarisAppLayout from "../components/PolarisAppLayout";
import PlanCard from "../components/billing/PlanCard";

// The honest billing page. The previous version rendered three mock cards
// (hardcoded $233.22/$500 cap, a fabricated 47/31 cycle, and a fake usage
// ledger of orders that never existed) — all tabled unreferenced in
// components/billing/.
//
// The app is FREE at App Store submission: the Partner Dashboard exposes one
// public Free plan, so nothing can be charged. This page says that plainly.
// It is deliberately kept (rather than deleted) because /app/payment and
// /app/payment/callback redirect here, and because an explicit "there is
// nothing to pay" screen is the cheapest possible proof of requirement 1.2.1
// for a reviewer who goes looking for billing.

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return {};
}

export default function BillingPage() {
  return (
    <PolarisAppLayout>
      <Page
        title="Billing"
        backAction={{ content: "Settings", url: "/app/settings" }}
      >
        <BlockStack gap="400">
          <PlanCard />
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingSm">
                Billing stays in Shopify
              </Text>
              <Text as="p" tone="subdued">
                Your current Shopify plan is Free. There is no subscription
                charge, trial, usage fee, card on file, or off-platform
                invoice. If paid plans are introduced later, Shopify will
                present them for approval and add approved charges to your
                regular Shopify invoice.
              </Text>
            </BlockStack>
          </Card>
        </BlockStack>
      </Page>
    </PolarisAppLayout>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
