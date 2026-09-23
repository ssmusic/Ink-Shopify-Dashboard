// THE DASHBOARD — three numbers, the orders' funnel in the charts' blue under
// them, and three rates in rings.
//
// Sam, 2026-09-23, on the first version (the console's Delivery page): "this
// should just be three up there" · "there should be nothing underneath those
// numbers" · "getting there from the order being recorded to the parcel
// arriving and what happened after that's weird" · "while they waited [is]
// weird" · "did it arrive when promised [is] weird" · "it's weird to say what
// the carrier said" · "orders through the door is strange" · "the whole thing
// is just bizarre" — and, of the order page, "blue highlights like the
// insights page" · "which prob should be called a dashboard". Later, of the
// Dashboard: "we have other kpi we can offer - real ones from the backend
// source of truth" · "make the dash better - maybe some circular kpi?".
//
// So: the three numbers (components/InkKpis.tsx); then one card — Shopify's
// FunnelChart (@shopify/polaris-viz, its Light theme's own blue) over
// Orders → Delivered → Open → Location shared, with no title and one line
// saying how the steps count (the funnel's "Open" counts delivered orders
// only, so without that line it would contradict the number above it); then
// the rates (components/InkDashboardRates.tsx), each from one door and one
// denominator. Gone: every section Sam named; "Time in transit" too (it ran
// from the order's creation, not its shipment, so its name was not true);
// "Seen at the door" (a verdict against the 100 m range — "we dont judge").
// The arithmetic for the rest stays in lib/delivery-insights.ts, undrawn.
//
// Three states, each saying only what is true:
//   · the numbers could not be read (no key yet, a refused or slow read) —
//     said as that, never as an empty store;
//   · ink holds no order with a record yet — said as that, never as a row of zeros;
//   · otherwise the numbers, and — when the delivery door did not answer —
//     a line saying so where the funnel would be.
//
// Every visible string is PLACEHOLDER copy — Sam's words replace it.

import { useEffect, useState, type ReactNode } from "react";
import { BlockStack, Box, Card, EmptyState, InlineStack, Text } from "@shopify/polaris";
import { FunnelChart, PolarisVizProvider } from "@shopify/polaris-viz";
import InkKpis from "./InkKpis";
import InkDashboardRates from "./InkDashboardRates";
import type { InkKpis as Kpis } from "../services/ink-kpis.server";
import type { DeliveryDashboardData } from "../services/ink-delivery.server";

function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

// Polaris Viz measures its box, so it draws in the browser only.
function Chart({ height, children }: { height: number; children: ReactNode }) {
  const mounted = useMounted();
  return <div style={{ height, width: "100%" }}>{mounted ? children : null}</div>;
}

export default function DeliveryDashboard({ kpis, delivery }: { kpis: Kpis | null; delivery: DeliveryDashboardData | null }) {
  if (!kpis) {
    return (
      <Card>
        <Text as="p" tone="subdued">
          {/* PLACEHOLDER copy */}
          Your numbers couldn't be read just now. Try again in a moment.
        </Text>
      </Card>
    );
  }
  if (kpis.recorded === 0) {
    return (
      <Card>
        {/* PLACEHOLDER copy — ink counts orders it holds a record for, not the store's every order. */}
        <EmptyState heading="No orders with records are available yet." image="" />
      </Card>
    );
  }

  const funnel = delivery && delivery.orders > 0 ? delivery.funnel : null;
  return (
    <PolarisVizProvider>
      <BlockStack gap="500">
        <InkKpis kpis={kpis} />
        {funnel ? (
          <Card>
            <BlockStack gap="300">
              <Text as="p" variant="bodySm" tone="subdued">
                {/* PLACEHOLDER copy — the one line the funnel needs to be true */}
                Each step counts the orders that also passed the step above.
              </Text>
              <Chart height={240}>
                <FunnelChart data={[{ name: "Orders", data: funnel.map((s) => ({ key: s.label, value: s.count })) }]} theme="Light" />
              </Chart>
              {/* The same figures in words, for a screen reader and the server render. */}
              <Box visuallyHidden>
                <BlockStack gap="100">
                  {funnel.map((s) => (
                    <InlineStack key={s.key} align="space-between">
                      <span>{s.label}</span>
                      <span>{`${s.count}${s.ofAbovePct != null ? ` · ${s.ofAbovePct}% of the step above` : ""}`}</span>
                    </InlineStack>
                  ))}
                </BlockStack>
              </Box>
            </BlockStack>
          </Card>
        ) : !delivery ? (
          <Card>
            <Text as="p" tone="subdued">
              {/* PLACEHOLDER copy */}
              Delivery details are unavailable. Refresh to try again.
            </Text>
          </Card>
        ) : null}
        <InkDashboardRates kpis={kpis} delivery={delivery} />
      </BlockStack>
    </PolarisVizProvider>
  );
}
