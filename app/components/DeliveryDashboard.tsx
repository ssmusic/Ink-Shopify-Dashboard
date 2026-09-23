// THE BIG DASHBOARD — the Insights pill: the record's numbers, then the
// console's Delivery page for this one merchant.
//
// Sam, 2026-09-23: "and a big fat dashboard". Sections, in the console's order
// and words (inkadmin src/pages/InsightsDelivery.tsx): Getting there (the
// funnel — ink's: orders → delivered → opened → location shared → seen at the
// door — and time in transit), What the carrier said, While they waited, Not
// recorded yet. Charts are Shopify's own (@shopify/polaris-viz) where a twin
// exists: FunnelChart, BarChart, SimpleBarChart. They draw in the browser only
// (they measure their box); every number is ALSO printed as text, so the
// server render, a screen reader and the tests all read the same figures.
//
// Every visible string is PLACEHOLDER copy — Sam's words replace it.

import { useEffect, useState, type ReactNode } from "react";
import { BlockStack, Card, EmptyState, InlineGrid, InlineStack, Text } from "@shopify/polaris";
import { BarChart, FunnelChart, PolarisVizProvider } from "@shopify/polaris-viz";
import InkKpis from "./InkKpis";
import { formatHours } from "../lib/delivery-insights";
import type { InkKpis as Kpis } from "../services/ink-kpis.server";
import type { DeliveryDashboardData } from "../services/ink-delivery.server";

function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

function Chart({ height, children }: { height: number; children: ReactNode }) {
  const mounted = useMounted();
  return <div style={{ height, width: "100%" }}>{mounted ? children : null}</div>;
}

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <BlockStack gap="300">
      <BlockStack gap="050">
        <Text as="h2" variant="headingMd">
          {title}
        </Text>
        {sub ? (
          <Text as="p" variant="bodySm" tone="subdued">
            {sub}
          </Text>
        ) : null}
      </BlockStack>
      {children}
    </BlockStack>
  );
}

const pct = (v: number | null) => (v == null ? "—" : `${v}%`);

/** The console's plain leader bar (inkadmin LeaderList): a row, its count, and
 *  a bar at its share; any non-zero bar gets a sliver so it is seen. */
function LeaderBar({ label, count, sharePct }: { label: string; count: number; sharePct: number | null }) {
  const w = sharePct == null ? 0 : Math.max(count > 0 ? 1.5 : 0, Math.min(100, sharePct));
  return (
    <BlockStack gap="100">
      <InlineStack align="space-between">
        <Text as="span" variant="bodySm">{label}</Text>
        <Text as="span" variant="bodySm" tone="subdued">{`${count} · ${pct(sharePct)} of orders`}</Text>
      </InlineStack>
      <div style={{ height: 8, borderRadius: 4, background: "var(--p-color-bg-surface-secondary)" }}>
        <div style={{ height: 8, borderRadius: 4, width: `${w}%`, background: "#1f9ef5" }} />
      </div>
    </BlockStack>
  );
}

export default function DeliveryDashboard({ kpis, delivery }: { kpis: Kpis | null; delivery: DeliveryDashboardData | null }) {
  const nothing = (!kpis || kpis.recorded === 0) && (!delivery || delivery.orders === 0);
  if (nothing) {
    return (
      <Card>
        <EmptyState heading="Nothing shipped yet" image="">
          <p>Your numbers appear here once your first order is recorded.</p>
        </EmptyState>
      </Card>
    );
  }

  return (
    <PolarisVizProvider>
      <BlockStack gap="500">
        {kpis ? <InkKpis kpis={kpis} /> : null}

        {delivery ? (
          <>
            <Section title="Getting there" sub="From the order being recorded to the parcel arriving, and what happened after.">
              <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                <Card>
                  <BlockStack gap="300">
                    <BlockStack gap="050">
                      <Text as="h3" variant="headingSm">Orders through to the door</Text>
                      <Text as="p" variant="bodyXs" tone="subdued">Each step counts the orders that also passed the step above.</Text>
                    </BlockStack>
                    <Chart height={220}>
                      <FunnelChart
                        data={[{ name: "Orders", data: delivery.funnel.map((s) => ({ key: s.label, value: s.count })) }]}
                        theme="Light"
                      />
                    </Chart>
                    <BlockStack gap="100">
                      {delivery.funnel.map((s) => (
                        <InlineStack key={s.key} align="space-between">
                          <Text as="span" variant="bodySm">{s.label}</Text>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {`${s.count}${s.ofAbovePct != null ? ` · ${pct(s.ofAbovePct)} of the step above` : ""}`}
                          </Text>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Card>
                <Card>
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingSm">Time in transit</Text>
                    <Chart height={220}>
                      <BarChart
                        data={[{ name: "Orders", data: delivery.transit.buckets.map((b) => ({ key: b.label, value: b.count })) }]}
                        theme="Light"
                        showLegend={false}
                      />
                    </Chart>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {`${delivery.transit.measured} of ${delivery.transit.delivered} delivered orders carry both times · median ${formatHours(delivery.transit.medianHours)}`}
                    </Text>
                    <InlineStack gap="300">
                      {delivery.transit.buckets.map((b) => (
                        <Text key={b.label} as="span" variant="bodyXs" tone="subdued">{`${b.label}: ${b.count}`}</Text>
                      ))}
                    </InlineStack>
                  </BlockStack>
                </Card>
              </InlineGrid>
            </Section>

            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              <Section title="What the carrier said" sub="Where every order stands, by the carrier's last word.">
                <Card>
                  <BlockStack gap="300">
                    {delivery.carrier.map((c) => (
                      <LeaderBar key={c.status} label={c.status} count={c.count} sharePct={c.ofEnrolledPct} />
                    ))}
                  </BlockStack>
                </Card>
              </Section>

              <Section title="While they waited" sub="Opens made 48 hours or more after the parcel last moved.">
                <Card>
                  <BlockStack gap="100">
                    <Text as="p" variant="headingXl">{String(delivery.waited.stuck)}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {`of ${delivery.waited.withData} opens that carry a movement time${delivery.waited.sharePct != null ? ` · ${pct(delivery.waited.sharePct)}` : ""}`}
                    </Text>
                  </BlockStack>
                </Card>
              </Section>
            </InlineGrid>

            <Section title="Not recorded yet">
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm">Did it arrive when it was promised</Text>
                  <Text as="p" variant="bodySm">
                    {`Which carrier keeps its promise — ${delivery.carrierNamed === 0 ? "no order names a carrier yet" : `only ${delivery.carrierNamed} ${delivery.carrierNamed === 1 ? "order names" : "orders name"} one so far`}`}
                  </Text>
                </BlockStack>
              </Card>
            </Section>

            {delivery.capped ? (
              <Text as="p" variant="bodySm" tone="subdued">Counted over your 2,000 most recent orders.</Text>
            ) : null}
          </>
        ) : null}
      </BlockStack>
    </PolarisVizProvider>
  );
}
