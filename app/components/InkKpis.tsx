import { BlockStack, Box, Card, InlineGrid, Text } from "@shopify/polaris";
import type { InkKpis as Kpis } from "../services/ink-kpis.server";
export default function InkKpis({ kpis }: { kpis: Kpis }) {
  return (
    <BlockStack gap="200">
      <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
        {[
          ["Orders", kpis.recorded],
          ["Open", kpis.opened],
          ["Location shared", kpis.locationShared],
        ].map(([label, value]) => (
          <Card key={label}>
            <BlockStack gap="100">
              <Text as="h2" variant="headingSm">
                {label}
              </Text>
              <Box color="text-info">
                <Text as="p" variant="headingXl">
                  {typeof value === "number"
                    ? value.toLocaleString("en-US")
                    : "Unavailable"}
                </Text>
              </Box>
            </BlockStack>
          </Card>
        ))}
      </InlineGrid>
      <Text as="p" tone="subdued">
        {kpis.capped
          ? "Counts cover up to 2,000 orders with a record."
          : "Counts cover orders with a record."}
      </Text>
    </BlockStack>
  );
}
