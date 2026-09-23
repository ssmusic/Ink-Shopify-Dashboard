import { useEffect, useState } from "react";
import { BlockStack, Box, Card, InlineGrid, Text } from "@shopify/polaris";
import { DonutChart, PolarisVizProvider } from "@shopify/polaris-viz";
import type { InkKpis } from "../services/ink-kpis.server";
import type { DeliveryDashboardData } from "../services/ink-delivery.server";
import "@shopify/polaris-viz/build/esm/styles.css";

const themes = {
  Light: {
    arc: { thickness: 9, cornerRadius: 0 },
    chartContainer: {
      minHeight: 120,
      padding: "0",
      backgroundColor: "transparent",
    },
  },
};

function Rate({
  label,
  rate,
  detail,
}: {
  label: string;
  rate: number | null;
  detail: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <Card>
      <InlineGrid columns="120px 1fr" gap="300" alignItems="center">
        {rate == null ? (
          <Box minHeight="120px" paddingBlock="600">
            <Text as="p" alignment="center" tone="subdued">
              No rate
            </Text>
          </Box>
        ) : (
          <Box width="120px" minHeight="120px">
            {mounted ? (
              <DonutChart
                isAnimated={false}
                showLegend={false}
                data={[
                  {
                    name: label,
                    color: "#005BD3",
                    data: [{ key: label, value: rate }],
                  },
                  {
                    name: "Remaining",
                    color: "#E3E3E3",
                    data: [{ key: label, value: 100 - rate }],
                  },
                ]}
                labelFormatter={(value) => `${value}%`}
                renderInnerValueContent={() => (
                  <Text as="span" variant="headingLg">{`${rate}%`}</Text>
                )}
              />
            ) : (
              <Box minHeight="120px" paddingBlock="600">
                <Text
                  as="p"
                  variant="headingLg"
                  alignment="center"
                >{`${rate}%`}</Text>
              </Box>
            )}
          </Box>
        )}
        <BlockStack gap="200">
          <Text as="h2" variant="headingSm">
            {label}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            {detail}
          </Text>
        </BlockStack>
      </InlineGrid>
    </Card>
  );
}

const percent = (count: number, total: number) =>
  total > 0 ? Math.round((count / total) * 100) : null;

/** Each ring uses one source and one denominator; never join independently capped samples. */
export default function InkDashboardRates({
  kpis,
  delivery,
}: {
  kpis: InkKpis | null;
  delivery: DeliveryDashboardData | null;
}) {
  const delivered = delivery?.funnel.find(
    (step) => step.key === "delivered",
  )?.count;
  return (
    <PolarisVizProvider defaultTheme="Light" themes={themes}>
      <BlockStack gap="200">
        <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
          {kpis && (
            <Rate
              label="Open rate"
              rate={kpis.openRate}
              detail={
                kpis.recorded > 0
                  ? `${kpis.opened.toLocaleString("en-US")} of ${kpis.recorded.toLocaleString("en-US")} orders have an open.`
                  : "No recorded orders yet."
              }
            />
          )}
          {delivery && delivered != null && (
            <Rate
              label="Delivery rate"
              rate={percent(delivered, delivery.orders)}
              detail={
                delivery.orders > 0
                  ? `${delivered.toLocaleString("en-US")} of ${delivery.orders.toLocaleString("en-US")} orders have a delivery date.`
                  : "No delivery data yet."
              }
            />
          )}
          {kpis && (
            <Rate
              label="Location sharing"
              rate={percent(kpis.locationShared, kpis.recorded)}
              detail={
                kpis.recorded > 0
                  ? `${kpis.locationShared.toLocaleString("en-US")} of ${kpis.recorded.toLocaleString("en-US")} orders have a device location from the first open.`
                  : "No recorded orders yet."
              }
            />
          )}
        </InlineGrid>
        <Text as="p" variant="bodySm" tone="subdued">
          An open records a visit to the tracking page. A shared location does
          not confirm receipt of the parcel.
        </Text>
      </BlockStack>
    </PolarisVizProvider>
  );
}
