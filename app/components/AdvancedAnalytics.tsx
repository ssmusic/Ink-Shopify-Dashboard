import { useEffect } from "react";
import { useFetcher } from "react-router";
import {
  BlockStack,
  InlineStack,
  Text,
  Spinner,
  Badge,
} from "@shopify/polaris";
import type { MerchantInsights } from "~/services/ink-api.server";

type InsightsResponse = MerchantInsights | { unavailable: true };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <BlockStack gap="100">
      <Text as="span" variant="bodySm" tone="subdued">
        {label}
      </Text>
      <Text as="span" variant="headingLg">
        {value}
      </Text>
      {sub ? (
        <Text as="span" variant="bodySm" tone="subdued">
          {sub}
        </Text>
      ) : null}
    </BlockStack>
  );
}

/** The outcome's word, in a plain badge: no outcome is drawn green, blue or
 *  yellow — a colour would judge it (ink's Dashboard judges nothing).
 *  UNCONFIRMED (no open on the record yet) read
 *  "Unconfirmed" — as if ink confirmed the others (Sam, 2026-09-24: ink never
 *  says a delivery was confirmed). It says the Ritualist's own word for the
 *  same outcome (the-ritualist src/pages/Shipments.tsx). ⚠️ PLACEHOLDER. */
const OUTCOME_WORDS: Record<string, string> = {
  ACCEPTED: "Accepted",
  UNCONFIRMED: "Pending",
  RETURNED: "Returned",
  EXPIRED: "Expired",
  DISPUTED: "Disputed",
};

// Native Advanced KPIs — integrity and outcomes, from the server-side aggregate
// (/app/api/dashboard/insights → ink-backend /api/merchant-insights). Replaces the
// Metabase iframe. No dispute/recovery cards; engagement metrics live on the lead view.
// 2026-09-24: the Dashboard now leads with ink's (components/DeliveryDashboard.tsx),
// which says the throughput — orders, opens, the open rate, shared locations —
// from this same door, so it is not said twice here. The average open distance
// left too: "Geofence accuracy" judged a distance, and each open's distance is
// said as data in its order's panel.
export default function AdvancedAnalytics() {
  const fetcher = useFetcher<InsightsResponse>();

  useEffect(() => {
    if (fetcher.state === "idle" && !fetcher.data) {
      fetcher.load(`/app/api/dashboard/insights?_t=${Date.now()}`);
    }
  }, [fetcher]);

  const data = fetcher.data;

  if (!data) {
    return (
      <InlineStack align="center" blockAlign="center" gap="200">
        <Spinner size="small" accessibilityLabel="Loading analytics" />
      </InlineStack>
    );
  }

  if ("unavailable" in data) {
    return (
      <Text as="p" tone="subdued" variant="bodySm">
        Analytics are temporarily unavailable.
      </Text>
    );
  }

  const { integrity: ig, sample_size: n } = data;
  const smallN = n < 20;
  const o = ig.outcomes;

  return (
    <BlockStack gap="500">
      {smallN ? (
        <Text as="p" tone="subdued" variant="bodySm">
          Based on {n.toLocaleString()} order{n === 1 ? "" : "s"} — small sample, read counts over
          percentages.
        </Text>
      ) : null}

      {/* Integrity */}
      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">
          Integrity
        </Text>
        <InlineStack gap="800" wrap>
          <Stat
            label="Records with a payload hash"
            value={`${ig.payload_integrity_pct}%`}
            sub="Hash present; signature not checked here"
          />
        </InlineStack>
        <BlockStack gap="100">
          <Text as="span" variant="bodySm" tone="subdued">
            Delivery outcomes
          </Text>
          <InlineStack gap="200" wrap>
            {(["ACCEPTED", "UNCONFIRMED", "RETURNED", "EXPIRED", "DISPUTED"] as const).map((k) => (
              <Badge key={k}>{`${OUTCOME_WORDS[k]}: ${o[k]}`}</Badge>
            ))}
          </InlineStack>
        </BlockStack>
      </BlockStack>
    </BlockStack>
  );
}
