import { useState } from "react";
import {
  Avatar,
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineGrid,
  InlineStack,
  Text,
} from "@shopify/polaris";
import type { InkConnection } from "../services/ink-connection.server";
import { INK_DATA_TINT } from "../lib/ink-palette";

export default function InkConnectionCard({
  connection,
  checking,
  onCheck,
}: {
  connection?: InkConnection;
  checking: boolean;
  onCheck: () => void;
}) {
  const name = connection?.name || "Your store";
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const logo =
    connection?.logoUrl && connection.logoUrl !== failedLogo
      ? connection.logoUrl
      : null;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join("")
    .toUpperCase();
  const shopify = connection?.shopify ?? "not_checked";
  const ink = connection?.ink ?? "not_checked";
  const status = (value: string) =>
    value === "connected"
      ? "Connected"
      : value === "setup"
        ? "Setup incomplete"
        : value === "unavailable"
          ? "Could not connect"
          : "Not checked";
  return (
    <Card padding="0">
      <Box padding="400" background="bg-surface-secondary">
        <InlineStack align="space-between" blockAlign="center" gap="300">
          <Text as="h2" variant="headingMd">
            Shopify connection
          </Text>
          <Button onClick={onCheck} loading={checking}>
            Check connection
          </Button>
        </InlineStack>
      </Box>
      <Box padding="400">
        <BlockStack gap="400">
          <InlineGrid
            columns="48px minmax(0, 1fr)"
            gap="300"
            alignItems="center"
          >
            {logo ? (
              <Avatar
                key={logo}
                size="xl"
                name={name}
                source={logo}
                onError={() => setFailedLogo(logo)}
                accessibilityLabel={`${name} store logo`}
              />
            ) : (
              <div style={{ background: INK_DATA_TINT, borderRadius: "var(--p-border-radius-200)", padding: "var(--p-space-300) 0" }}>
                <Text as="p" alignment="center" fontWeight="semibold">
                  {initials}
                </Text>
              </div>
            )}
            <BlockStack gap="100">
              <Text as="h3" variant="headingMd" breakWord>
                {name}
              </Text>
              {connection?.shop && connection.shop !== name && (
                <Text as="p" tone="subdued" breakWord>
                  {connection.shop}
                </Text>
              )}
              <Text as="p" tone="subdued">
                Account access is managed in Shopify.
              </Text>
            </BlockStack>
          </InlineGrid>
          <Divider />
          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
            <BlockStack gap="200">
              <InlineStack align="space-between" gap="200">
                <Text as="p" fontWeight="semibold">
                  Shopify access
                </Text>
                <Badge>
                  {status(shopify)}
                </Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                {shopify === "connected"
                  ? "Shopify returned this store’s details."
                  : shopify === "unavailable"
                    ? "Shopify could not be reached. Check again, or reopen ink from Shopify Admin."
                    : "Shopify access has not been checked."}
              </Text>
            </BlockStack>
            <BlockStack gap="200">
              <InlineStack align="space-between" gap="200">
                <Text as="p" fontWeight="semibold">
                  Ink data access
                </Text>
                <Badge>
                  {status(ink)}
                </Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                {ink === "connected"
                  ? "Ink returned this store’s dashboard data."
                  : ink === "setup"
                    ? "Store setup is incomplete. Check again shortly. Contact support if it remains incomplete."
                    : ink === "unavailable"
                      ? "Ink data could not be reached. Check again. Contact support if the problem continues."
                      : "Ink data access has not been checked."}
              </Text>
            </BlockStack>
          </InlineGrid>
          <Divider />
          <Text as="p" tone="subdued">
            These checks confirm access. They do not confirm that every order or
            carrier update has arrived.
          </Text>
          {connection?.checkedAt && (
            <Text as="p" variant="bodySm" tone="subdued">
              Last checked{" "}
              {new Date(connection.checkedAt).toLocaleString("en-US", {
                timeZone: "UTC",
                timeZoneName: "short",
              })}
            </Text>
          )}
        </BlockStack>
      </Box>
    </Card>
  );
}
