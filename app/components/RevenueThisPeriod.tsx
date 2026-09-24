import { useFetcher } from "react-router";
import { useEffect } from "react";
import {
  BlockStack,
  Card,
  Divider,
  InlineStack,
  Spinner,
  Text,
} from "@shopify/polaris";

type Period = { totalValue: number; count: number; aov: number };
type Metrics = {
  currentPeriod?: Period;
  previousPeriod?: Period;
  trends?: { valueProtected?: number };
  error?: string;
};

const dollars = (value: number, digits: number) =>
  `$${value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

// The order value of the last 30 days — the Ritualist's own number (ink's
// Dashboard has none), summed from Shopify's orders by /app/api/dashboard/metrics.
// Drawn as ink's Dashboard draws a card: Polaris, sentence case, no colour for
// up or down. A failed read says so and never becomes $0 (ink's law,
// services/ink-kpis.server.ts: "Failed reads remain unavailable, and never
// turn into zero counts"); the change shows only against a previous 30 days
// that had a value — "+100%" over nothing compares nothing.
const RevenueThisPeriod = () => {
  const fetcher = useFetcher<Metrics>();

  useEffect(() => {
    if (fetcher.state === "idle" && !fetcher.data) {
      fetcher.load(`/app/api/dashboard/metrics?_t=${Date.now()}`);
    }
  }, [fetcher]);

  const data = fetcher.data;
  const metrics = data?.currentPeriod;
  const previous = data?.previousPeriod;
  const change = data?.trends?.valueProtected;
  const compared =
    previous && previous.totalValue > 0 && typeof change === "number" && Number.isFinite(change);

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center" gap="200">
          <Text as="h2" variant="headingMd">
            Enrolled order value
          </Text>
          <Text as="span" tone="subdued">
            Last 30 days
          </Text>
        </InlineStack>

        {!data ? (
          <InlineStack align="center">
            <Spinner size="small" accessibilityLabel="Loading" />
          </InlineStack>
        ) : !metrics ? (
          <Text as="p" tone="subdued">
            Order totals are unavailable.
          </Text>
        ) : (
          <>
            <BlockStack gap="100">
              <InlineStack gap="200" blockAlign="baseline">
                <Text as="p" variant="headingXl">
                  {dollars(metrics.totalValue, 0)}
                </Text>
                {compared ? (
                  <Text as="span" tone="subdued">
                    {`${change >= 0 ? "+" : "-"}${Math.abs(change).toFixed(1)}% vs last period`}
                  </Text>
                ) : null}
              </InlineStack>
              <Text as="p" tone="subdued">
                Retail value of all enrolled shipments
              </Text>
            </BlockStack>
            <Divider />
            <BlockStack gap="200">
              <InlineStack align="space-between" gap="200">
                <Text as="span" tone="subdued">
                  Enrolled shipments
                </Text>
                <Text as="span" fontWeight="medium">
                  {metrics.count.toLocaleString()}
                </Text>
              </InlineStack>
              <InlineStack align="space-between" gap="200">
                <Text as="span" tone="subdued">
                  Avg. order value
                </Text>
                <Text as="span" fontWeight="medium">
                  {dollars(metrics.aov, 2)}
                </Text>
              </InlineStack>
            </BlockStack>
          </>
        )}
      </BlockStack>
    </Card>
  );
};

export default RevenueThisPeriod;
