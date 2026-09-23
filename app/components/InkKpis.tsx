// INK'S NUMBERS — the Insights pill: three numbers, nothing under them.
//
// Sam, 2026-09-23: "orders recorded is just be called orders" · "there should
// be nothing underneath those numbers" · "location shared that's it in that
// box" · "the signed 100% should not be there that's obvious and disputed
// should be gone" · "this should just be three up there".
//
// The numbers are GET /api/merchant-insights (services/ink-kpis.server.ts),
// read with the merchant's own key:
//   · Orders          — the orders ink holds a record for (throughput.enrollments);
//   · Opened          — of those, the orders whose tracking link a person opened
//                       at least once (a link preview or a bot is never counted:
//                       ink-backend verify.js keeps proxy opens off tap_count);
//   · Location shared — the orders whose customer's phone shared a location that
//                       was measured against the delivery address
//                       (first_tap_distance_source "gps").
// Labels are Sam's words. The one line under the row appears only past 2,000
// orders, where "Orders" would otherwise read as the store's whole count.

import { BlockStack, Card, InlineGrid, Text } from "@shopify/polaris";
import type { InkKpis as Kpis } from "../services/ink-kpis.server";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text as="p" variant="bodySm" tone="subdued">
          {label}
        </Text>
        <Text as="p" variant="headingXl">
          {value}
        </Text>
      </BlockStack>
    </Card>
  );
}

const count = (n: number) => n.toLocaleString("en-US");

export default function InkKpis({ kpis }: { kpis: Kpis }) {
  return (
    <BlockStack gap="200">
      <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
        <Stat label="Orders" value={count(kpis.recorded)} />
        <Stat label="Opened" value={count(kpis.opened)} />
        <Stat label="Location shared" value={count(kpis.locationShared)} />
      </InlineGrid>
      {kpis.capped ? (
        <Text as="p" variant="bodySm" tone="subdued">
          {/* PLACEHOLDER copy — true only past 2,000 orders, and needed there. */}
          Counted over your 2,000 most recent orders.
        </Text>
      ) : null}
    </BlockStack>
  );
}
