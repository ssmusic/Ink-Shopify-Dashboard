import { authenticate } from "../shopify.server";
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, BlockStack, Card, Text } from "@shopify/polaris";

// The honest billing page, said once. The app is FREE at App Store
// submission: the Partner Dashboard exposes one public Free plan, so nothing
// can be charged. An explicit "there is nothing to pay" screen is the cheapest
// proof of requirement 1.2.1 for a reviewer who goes looking for billing.
// If paid plans are ever configured they run through Shopify's Managed
// Pricing, and this page gains a link to SHOPIFY's plan picker — built from a
// VERIFIED app handle, never a guessed one.

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return {};
}

export default function BillingPage() {
  return (
    <Page title="Billing" backAction={{ content: "Home", url: "/app" }}>
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingSm">Your Shopify plan is Free.</Text>
          <Text as="p" tone="subdued">
            There is no subscription charge, trial, usage fee, card on file, or off-platform
            invoice. Installing the app creates no charge. If paid plans are introduced later,
            Shopify will present them for approval and add approved charges to your regular
            Shopify invoice. Nothing starts on its own.
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
export const headers: HeadersFunction = (args) => boundary.headers(args);
