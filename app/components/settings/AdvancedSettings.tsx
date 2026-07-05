import { useState } from "react";
import {
  BlockStack,
  Card,
  Text,
  Collapsible,
} from "@shopify/polaris";
import VerificationSettings from "./VerificationSettings";
// WebhooksSettings removed from render (kept in tree, unreferenced): it was
// pure mock theater — a fake secret, a fake "Test webhook" that slept 1.5s
// and claimed success, a fabricated activity log. Real webhook registration
// is automatic (app.tsx registerWebhooks); there is nothing for a merchant
// to configure here.

const AdvancedSettings = () => {
  const [verificationOpen, setVerificationOpen] = useState(false);

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

    </BlockStack>
  );
};

export default AdvancedSettings;
