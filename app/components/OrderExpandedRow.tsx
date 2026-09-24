import { OrderPanel, type InkOrderRow } from "./InkRecentOrders";

// THE RITUALIST'S ORDERS ROW, OPENED — ink's own panel
// (components/InkRecentOrders.tsx OrderPanel), the same one ink's Orders
// opens onto: what was bought and who it went to; the order's activity on the
// honest rail; then Advanced, closed until pressed, as ink's is (Sam,
// 2026-09-24, bringing ink's polish over). The Orders ledger and the
// Dashboard's recent orders draw it through InkRecentOrders `renderPanel`.
//
// What stays the Ritualist's: the record is included, so the row's door never
// offers it and never names a price (services/ritualist-rows.server.ts builds
// it so). The "View full record" button and its full-page view are gone
// (Sam, 2026-09-24); the studio is one press away on the Dashboard.

interface OrderExpandedRowProps {
  /** The order as ink's panel reads it: the glance, the record, the door, the
   *  timeline — the record side here, or still streaming, as on ink's Orders. */
  row: InkOrderRow;
  /** Threaded to the panel as ink's list threads it; the maps here are OpenStreetMap's and need none. */
  mapsKey?: string | null;
  /** Advanced starts closed, as on ink's Orders; a test may open it to read it. */
  advancedOpen?: boolean;
}

const OrderExpandedRow = ({ row, mapsKey = null, advancedOpen = false }: OrderExpandedRowProps) => (
  <OrderPanel row={row} mapsKey={mapsKey} advancedOpen={advancedOpen} />
);

export default OrderExpandedRow;
