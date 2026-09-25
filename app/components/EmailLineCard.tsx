import { useState } from "react";
import { Badge, BlockStack, Box, Button, Card, InlineStack, List, Text } from "@shopify/polaris";
import type { EmailLineView } from "../services/email-line.server";
import { EMAIL_LINE_TEST, emailDoorSentence } from "../services/notification-snippet";

// THE ONE MANUAL STEP, AND WHETHER IT WORKS (2026-09-24). Shopify sends its
// shipping emails before any app can change their link (measured on the
// Steve Madden rig: 1–6 s ahead of ink's rewrite, every time), and no app can
// edit a notification template. So the merchant pastes one line; this card
// hands it over and then reports, from real taps on the order door, whether
// buyers are arriving through it. Every sentence is PLACEHOLDER for Sam.
export default function EmailLineCard({ line }: { line: EmailLineView | null | undefined }) {
  const [copied, setCopied] = useState(false);
  // No page address, no line: the card had nothing a merchant could do
  // ("not set yet", with no way to set it — a store on its myshopify address
  // alone, like a review store, never gets one). It is not drawn (2026-09-25).
  if (!line || !line.snippet) return null;
  const status = emailDoorSentence(line.emailDoor);
  async function copy() {
    if (!line?.snippet) return;
    try {
      await navigator.clipboard.writeText(line.snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack gap="200" blockAlign="center">
          <Text as="h2" variant="headingMd">
            Your page in Shopify's emails
          </Text>
          {line.snippet && (
            <Badge tone={status.working ? "success" : "attention"}>
              {status.working ? "Working" : "Not yet"}
            </Badge>
          )}
        </InlineStack>
        {!line.snippet ? (
          <Text as="p" tone="subdued">
            Your page address is not set yet, so there is no line to paste.
          </Text>
        ) : (
          <>
            <Text as="p">
              Shopify sends its shipping email before ink can change the link in it, and apps
              cannot edit Shopify's emails. Paste this line once into each email below.
            </Text>
            <Box background="bg-surface-secondary" padding="300" borderRadius="200">
              <BlockStack gap="200">
                <div style={{ overflowX: "auto", maxWidth: "100%" }}>
                  <code
                    data-testid="email-line-snippet"
                    style={{ fontFamily: "monospace", fontSize: "12px", whiteSpace: "pre", display: "block" }}
                  >
                    {line.snippet}
                  </code>
                </div>
                <InlineStack gap="200">
                  <Button onClick={() => void copy()}>{copied ? "Copied" : "Copy the line"}</Button>
                  <Button url={line.notificationsUrl} target="_blank" variant="plain">
                    Open Shopify notifications
                  </Button>
                </InlineStack>
              </BlockStack>
            </Box>
            <List type="number">
              <List.Item>
                Open each of these, then Edit code: {line.templates.join(", ")}.
              </List.Item>
              <List.Item>Put the cursor at the very top, press Enter, and paste the line on the new first line. Keep everything else.</List.Item>
              <List.Item>Save.</List.Item>
            </List>
            <Text as="p" tone="subdued">
              {EMAIL_LINE_TEST}
            </Text>
            <Text as="p" tone={status.working ? "success" : "subdued"}>
              <span data-testid="email-line-status">{status.text}</span>
            </Text>
          </>
        )}
      </BlockStack>
    </Card>
  );
}
