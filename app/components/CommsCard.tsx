import { useEffect } from "react";
import { useFetcher } from "react-router";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Spinner,
  Text,
} from "@shopify/polaris";

// The dashboard Communications card — REAL state only (the merchant's actual
// notification_settings via /app/api/dashboard/comms). Replaces the old
// CommunicationsUsage card, which rendered 48,726 fictional messages. Drawn
// in Polaris beside ink's Dashboard: sentence case, the word "On" or "Off"
// in a plain badge, no colour for either.

type CommsSettings = {
  channels?: { email?: boolean; sms?: boolean };
  delivery?: Record<string, boolean>;
  reminders?: Record<string, boolean>;
} | null;

function Row({ label, on }: { label: string; on: boolean }) {
  return (
    <InlineStack align="space-between" blockAlign="center" gap="200">
      <Text as="span" tone="subdued">
        {label}
      </Text>
      <Badge>{on ? "On" : "Off"}</Badge>
    </InlineStack>
  );
}

const CommsCard = () => {
  const fetcher = useFetcher<{ settings: CommsSettings }>();

  useEffect(() => {
    if (fetcher.state === "idle" && !fetcher.data) {
      fetcher.load("/app/api/dashboard/comms");
    }
  }, [fetcher]);

  const isLoading = fetcher.state === "loading" || !fetcher.data;
  const s = fetcher.data?.settings;
  const emailOn = s?.channels?.email !== false; // default-on mirrors settings
  const smsOn = s?.channels?.sms === true;

  return (
    <Card>
      <BlockStack gap="300">
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">
            Communications
          </Text>
          <Text as="p" tone="subdued">
            Shipping and delivery updates, sent in your brand's name.
          </Text>
        </BlockStack>
        {isLoading ? (
          <InlineStack align="center">
            <Spinner size="small" accessibilityLabel="Loading" />
          </InlineStack>
        ) : (
          <BlockStack gap="200">
            <Row label="Email notifications" on={emailOn} />
            <Row label="Text notifications" on={smsOn} />
          </BlockStack>
        )}
        <InlineStack>
          <Button variant="plain" url="/app/settings">
            Manage in Settings
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
};

export default CommsCard;
