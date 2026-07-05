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
// components/billing/. Billing truth lives with Shopify (Managed Pricing):
// the merchant approves any plan inside Shopify, sees charges on their
// Shopify invoice, and changes plans from the app's App Store listing.
// This page states exactly that and invents nothing.

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
                How billing works
              </Text>
              <Text as="p" tone="subdued">
                All INK charges run through Shopify — they appear on your
                regular Shopify invoice, and no charge ever starts without
                your approval inside Shopify. There is no separate card on
                file and nothing to cancel outside Shopify: uninstalling the
                app ends any subscription automatically.
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
