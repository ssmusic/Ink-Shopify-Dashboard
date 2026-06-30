import { useEffect } from "react";
import { useFetcher } from "react-router";
import {
  BlockStack,
  InlineStack,
  Text,
  Spinner,
  Badge,
  Divider,
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

const OUTCOME_TONE: Record<string, "success" | "info" | "warning" | undefined> = {
  ACCEPTED: "success",
  RETURNED: "info",
  EXPIRED: "warning",
  UNCONFIRMED: undefined,
  DISPUTED: undefined,
};

// Native Advanced KPIs — operational + integrity, from the server-side aggregate
// (/app/api/dashboard/insights → ink-backend /api/merchant-insights). Replaces the
// Metabase iframe. No dispute/recovery cards; engagement metrics live on the lead view.
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

  const { throughput: t, integrity: ig, sample_size: n } = data;
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

      {/* Throughput */}
      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">
          Throughput
        </Text>
        <InlineStack gap="800" wrap>
          <Stat label="Enrollments" value={t.enrollments.toLocaleString()} />
          <Stat label="Opened" value={t.opened.toLocaleString()} />
          <Stat label="Open rate" value={`${t.open_rate_pct}%`} sub={`${t.opened}/${t.enrollments}`} />
        </InlineStack>
      </BlockStack>

      <Divider />

      {/* Integrity */}
      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">
          Integrity
        </Text>
        <InlineStack gap="800" wrap>
          <Stat
            label="Payload integrity"
            value={`${ig.payload_integrity_pct}%`}
            sub="signed records intact"
          />
          <Stat
            label="Geofence accuracy"
            value={ig.geofence.avg_distance_m != null ? `${ig.geofence.avg_distance_m} m` : "—"}
            sub={`${ig.geofence.gps_count} GPS · ${ig.geofence.ip_count} IP`}
          />
        </InlineStack>
        <BlockStack gap="100">
          <Text as="span" variant="bodySm" tone="subdued">
            Delivery outcomes
          </Text>
          <InlineStack gap="200" wrap>
            {(["ACCEPTED", "UNCONFIRMED", "RETURNED", "EXPIRED", "DISPUTED"] as const).map((k) => (
              <Badge key={k} tone={OUTCOME_TONE[k]}>
                {`${k.charAt(0)}${k.slice(1).toLowerCase()}: ${o[k]}`}
              </Badge>
            ))}
          </InlineStack>
        </BlockStack>
      </BlockStack>
    </BlockStack>
  );
}
