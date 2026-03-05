import { useState } from "react";
import {
  BlockStack,
  Card,
  Text,
  Collapsible,
} from "@shopify/polaris";
import VerificationSettings from "./VerificationSettings";
import WebhooksSettings from "./WebhooksSettings";

const AdvancedSettings = () => {
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [webhooksOpen, setWebhooksOpen] = useState(false);

  return (
    <BlockStack gap="400">
      <Text as="p" variant="bodySm" tone="subdued">
        Configure verification thresholds and integrations.
      </Text>

      <Card>
        <BlockStack gap="400">
          <button
            onClick={() => setVerificationOpen(!verificationOpen)}
            style={{
              width: "100%",
              textAlign: "left",
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 0,
            }}
          >
            <Text as="h3" variant="headingSm">Verification</Text>
            <Text as="span" tone="subdued">{verificationOpen ? "−" : "+"}</Text>
          </button>
          <Collapsible open={verificationOpen} id="verification-section">
            <VerificationSettings />
          </Collapsible>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="400">
          <button
            onClick={() => setWebhooksOpen(!webhooksOpen)}
            style={{
              width: "100%",
              textAlign: "left",
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 0,
            }}
          >
            <Text as="h3" variant="headingSm">Webhooks</Text>
            <Text as="span" tone="subdued">{webhooksOpen ? "−" : "+"}</Text>
          </button>
          <Collapsible open={webhooksOpen} id="webhooks-section">
            <WebhooksSettings />
          </Collapsible>
        </BlockStack>
      </Card>
    </BlockStack>
  );
};

export default AdvancedSettings;
