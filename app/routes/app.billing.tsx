import { authenticate } from "../shopify.server";
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, BlockStack } from "@shopify/polaris";
import PolarisAppLayout from "../components/PolarisAppLayout";
import BillingCycleCard from "../components/billing/BillingCycleCard";
import UsageCapCard from "../components/billing/UsageCapCard";
import UsageHistoryCard from "../components/billing/UsageHistoryCard";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return {};
}

export default function BillingPage() {
  return (
    <PolarisAppLayout>
      <Page
        title="Usage & Billing"
        backAction={{ content: "Settings", url: "/app/settings" }}
      >
        <BlockStack gap="400">
          <BillingCycleCard />
          <UsageCapCard />
          <UsageHistoryCard />
        </BlockStack>
      </Page>
    </PolarisAppLayout>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
