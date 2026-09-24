import { BlockStack, Box, Button, InlineStack, Text } from "@shopify/polaris";
import { ChevronUpIcon } from "@shopify/polaris-icons";
import { OrderPanel, type InkRecentOrderRow } from "./InkRecentOrders";

// THE RITUALIST'S SHIPMENTS ROW, OPENED — ink's own panel
// (components/InkRecentOrders.tsx OrderPanel), the same one ink's Orders
// opens onto: what was bought and who it went to; the order's activity on the
// honest rail, each step with where its time came from; then Advanced — the
// record's files, its words, the browser's check, THE LAST OPEN and EVERY
// OPEN on their grey maps, every signed event, the delivery window.
//
// What stays the Ritualist's: the record is included, so the row's door never
// offers it and never names a price (services/ritualist-rows.server.ts builds
// it so); and "View full record" still opens the Ritualist's full-page view,
// which leads to the studio — the brand book, the pages and the campaigns
// live there, never in the embed.

interface OrderExpandedRowProps {
  /** The order as ink's panel reads it: the glance, the record, the door, the timeline. */
  row: InkRecentOrderRow;
  onCollapse: () => void;
  /** The Ritualist's full-page view of the order. */
  onViewFull?: () => void;
  /** Threaded to the panel as ink's list threads it; the maps here are OpenStreetMap's and need none. */
  mapsKey?: string | null;
}

const OrderExpandedRow = ({ row, onCollapse, onViewFull, mapsKey = null }: OrderExpandedRowProps) => (
  <Box borderBlockStartWidth="025" borderColor="border" background="bg-surface">
    <BlockStack gap="0">
      <Box background="bg-surface-secondary" paddingInline="400" paddingBlock="200">
        <InlineStack align="space-between" blockAlign="center" gap="200">
          <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">
            Order details
          </Text>
          <InlineStack gap="200" blockAlign="center">
            {onViewFull ? (
              <Button size="slim" onClick={onViewFull}>
                View full record
              </Button>
            ) : null}
            <Button
              size="slim"
              icon={ChevronUpIcon}
              onClick={onCollapse}
              accessibilityLabel="Collapse order details"
            />
          </InlineStack>
        </InlineStack>
      </Box>
      <OrderPanel row={row} mapsKey={mapsKey} />
    </BlockStack>
  </Box>
);

export default OrderExpandedRow;
