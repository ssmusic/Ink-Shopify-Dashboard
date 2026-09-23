import { useId } from "react";
import {
  Banner,
  BlockStack,
  Box,
  Card,
  InlineGrid,
  InlineStack,
  ProgressBar,
  Text,
} from "@shopify/polaris";
import InkKpis from "./InkKpis";
import InkDashboardRates from "./InkDashboardRates";
import { formatHours } from "../lib/delivery-insights";
import type { InkKpis as Kpis } from "../services/ink-kpis.server";
import type { DeliveryDashboardData } from "../services/ink-delivery.server";

function Bar({
  label,
  count,
  total,
  note,
}: {
  label: string;
  count: number;
  total: number;
  note?: string;
}) {
  const labelId = useId();
  return (
    <BlockStack gap="100">
      <InlineStack align="space-between" gap="200">
        <Text as="span" id={labelId}>
          {label}
        </Text>
        <Text as="span" fontWeight="semibold">
          {count.toLocaleString("en-US")}
        </Text>
      </InlineStack>
      <ProgressBar
        progress={total > 0 ? (count / total) * 100 : 0}
        tone="highlight"
        size="small"
        ariaLabelledBy={labelId}
      />
      {note && (
        <Text as="p" variant="bodySm" tone="subdued">
          {note}
        </Text>
      )}
    </BlockStack>
  );
}
export default function DeliveryDashboard({
  kpis,
  delivery,
}: {
  kpis: Kpis | null;
  delivery: DeliveryDashboardData | null;
}) {
  if (!kpis && !delivery)
    return (
      <Banner tone="info">Dashboard unavailable. Refresh to try again.</Banner>
    );
  if (kpis?.recorded === 0 && delivery?.orders === 0)
    return (
      <Card>
        <Text as="p">
          No orders yet. New orders will appear here after installation.
        </Text>
      </Card>
    );
  return (
    <BlockStack gap="400">
      {kpis ? (
        <InkKpis kpis={kpis} />
      ) : (
        <Banner tone="info">Order totals are unavailable.</Banner>
      )}
      <InkDashboardRates kpis={kpis} delivery={delivery} />
      {delivery ? (
        <>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            <Card>
              <BlockStack gap="400">
                <Box
                  background="bg-surface-secondary"
                  padding="300"
                  borderRadius="200"
                >
                  <Text as="h2" variant="headingMd">
                    Delivery and opens
                  </Text>
                </Box>
                <Text as="p" tone="subdued">
                  Each count includes only orders in the previous step.
                </Text>
                {delivery.funnel.map((s) => (
                  <Bar
                    key={s.key}
                    label={s.label}
                    count={s.count}
                    total={delivery.orders}
                    note={
                      s.ofAbovePct == null
                        ? undefined
                        : `${s.ofAbovePct}% of the previous step`
                    }
                  />
                ))}
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="400">
                <Box
                  background="bg-surface-secondary"
                  padding="300"
                  borderRadius="200"
                >
                  <Text as="h2" variant="headingMd">
                    Time to delivery
                  </Text>
                </Box>
                {delivery.transit.measured > 0 ? (
                  <>
                    <Text as="p">{`Median ${formatHours(delivery.transit.medianHours)} from recording to delivery.`}</Text>
                    {delivery.transit.buckets.map((b) => (
                      <Bar
                        key={b.label}
                        label={b.label}
                        count={b.count}
                        total={delivery.transit.measured}
                      />
                    ))}
                    <Text
                      as="p"
                      tone="subdued"
                    >{`${delivery.transit.measured} of ${delivery.transit.delivered} delivered orders have both timestamps.`}</Text>
                  </>
                ) : (
                  <Text as="p" tone="subdued">
                    No delivered orders have both timestamps.
                  </Text>
                )}
              </BlockStack>
            </Card>
          </InlineGrid>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            <Card>
              <BlockStack gap="400">
                <Box
                  background="bg-surface-secondary"
                  padding="300"
                  borderRadius="200"
                >
                  <Text as="h2" variant="headingMd">
                    Delivery status
                  </Text>
                </Box>
                {delivery.carrier.length ? (
                  delivery.carrier.map((c) => (
                    <Bar
                      key={c.status}
                      label={c.status}
                      count={c.count}
                      total={delivery.orders}
                    />
                  ))
                ) : (
                  <Text as="p" tone="subdued">
                    No orders available.
                  </Text>
                )}
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Box
                  background="bg-surface-secondary"
                  padding="300"
                  borderRadius="200"
                >
                  <Text as="h2" variant="headingMd">
                    Opens without a tracking update
                  </Text>
                </Box>
                {delivery.waited.withData > 0 ? (
                  <>
                    <Box color="text-info">
                      <Text as="p" variant="headingXl">
                        {String(delivery.waited.stuck)}
                      </Text>
                    </Box>
                    <Text
                      as="p"
                      tone="subdued"
                    >{`${delivery.waited.stuck} of ${delivery.waited.withData} measured opens occurred at least 48 hours after the last recorded parcel movement.`}</Text>
                  </>
                ) : (
                  <Text as="p" tone="subdued">
                    Movement times are unavailable for these opens.
                  </Text>
                )}
              </BlockStack>
            </Card>
          </InlineGrid>
          {delivery.capped && (
            <Text as="p" tone="subdued">
              Delivery figures cover up to 2,000 orders.
            </Text>
          )}
        </>
      ) : (
        <Banner tone="info">
          Delivery details are unavailable. Refresh to try again.
        </Banner>
      )}
    </BlockStack>
  );
}
