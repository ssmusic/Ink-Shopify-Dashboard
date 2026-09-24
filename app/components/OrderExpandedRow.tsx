import { Box, Button, InlineStack } from "@shopify/polaris";
import { OrderPanel, type InkOrderRow } from "./InkRecentOrders";

// THE RITUALIST'S SHIPMENTS ROW, OPENED — ink's own panel
// (components/InkRecentOrders.tsx OrderPanel), the same one ink's Orders
// opens onto: what was bought and who it went to; the order's activity on the
// honest rail, each step with where its time came from; then Advanced — the
// record's files, its words, the browser's check, THE LAST OPEN and EVERY
// OPEN on their grey maps, every signed event, the delivery window. The
// Shipments ledger draws it in place of ink's bare panel
// (routes/app.tagged-shipments._index.tsx, InkRecentOrders `renderPanel`).
//
// What stays the Ritualist's: the record is included, so the row's door never
// offers it and never names a price (services/ritualist-rows.server.ts builds
// it so); and the row ends on "View full record", as the web app's rows end
// on "View full order" — the Ritualist's full-page view, which leads to the
// studio, where the brand book, the pages and the campaigns live.

interface OrderExpandedRowProps {
  /** The order as ink's panel reads it: the glance, the record, the door, the
   *  timeline — the record side here, or still streaming, as on ink's Orders. */
  row: InkOrderRow;
  /** The Ritualist's full-page view of the order. */
  onViewFull?: () => void;
  /** Threaded to the panel as ink's list threads it; the maps here are OpenStreetMap's and need none. */
  mapsKey?: string | null;
}

const OrderExpandedRow = ({ row, onViewFull, mapsKey = null }: OrderExpandedRowProps) => (
  <>
    <OrderPanel row={row} mapsKey={mapsKey} />
    {onViewFull && row.detail ? (
      <Box paddingInlineStart={{ xs: "400", md: "1000" }} paddingInlineEnd="400" paddingBlockEnd="400">
        <InlineStack>
          <Button onClick={onViewFull}>View full record</Button>
        </InlineStack>
      </Box>
    ) : null}
  </>
);

export default OrderExpandedRow;
