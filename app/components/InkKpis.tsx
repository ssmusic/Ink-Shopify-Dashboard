// INK'S NUMBERS — the Insights KPIs at the top of ink's home.
//
// Sam, 2026-09-23: "i want to import kpi from insights". The numbers are the
// dashboard's own "Since your first order" block (GET /api/merchant-insights,
// services/ink-kpis.server.ts), laid out as Polaris stat tiles. Every label is
// PLACEHOLDER copy — Sam's words replace it.

import { BlockStack, Card, InlineGrid, Text } from "@shopify/polaris";
import type { InkKpis as Kpis } from "../services/ink-kpis.server";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text as="p" variant="bodySm" tone="subdued">
          {label}
        </Text>
        <Text as="p" variant="headingXl">
          {value}
        </Text>
        {sub ? (
          <Text as="p" variant="bodySm" tone="subdued">
            {sub}
          </Text>
        ) : null}
      </BlockStack>
    </Card>
  );
}

const count = (n: number) => n.toLocaleString("en-US");

export default function InkKpis({ kpis }: { kpis: Kpis }) {
  return (
    <BlockStack gap="200">
      <InlineGrid columns={{ xs: 2, md: 5 }} gap="300">
        {/* PLACEHOLDER labels and sub-lines — the dashboard's words where it has them */}
        <Stat label="Orders recorded" value={count(kpis.recorded)} sub="since your first order" />
        <Stat label="Opened" value={count(kpis.opened)} sub={`${kpis.openRatePct} in every 100`} />
        <Stat label="Location shared" value={count(kpis.locationShared)} sub="by the customer's phone" />
        <Stat label="Signed" value={`${kpis.signedPct}%`} sub="carry the signed record" />
        <Stat label="Disputed" value={count(kpis.disputed)} />
      </InlineGrid>
      {kpis.capped ? (
        <Text as="p" variant="bodySm" tone="subdued">
          {/* PLACEHOLDER copy */}
          Counted over your 2,000 most recent orders.
        </Text>
      ) : null}
    </BlockStack>
  );
}
