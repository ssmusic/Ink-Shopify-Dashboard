// INK'S RECENT ORDERS — THE RITUALIST'S SHIPMENTS LIST, AND THE RECORD'S DOOR
// AT THE BOTTOM OF EACH ROW'S ACCORDION.
//
// Sam, 2026-09-23: "recent orders should show just like the ritualist orders
// with an accordion and the get the record at the bottom of the accordion".
// So this is the markup of routes/app.tagged-shipments._index.tsx — the same
// IndexTable columns (Order · Customer · Date · Total · Status), the same
// click-to-expand row, the same mobile cards, the same expanded panel
// (components/OrderExpandedRow.tsx) — with ink's three differences:
//   · the panel's "View Full Record" opens the order's public record;
//   · the Ritualist-studio sentence is replaced by ink's own;
//   · the panel's footer carries the record's door ("Get the record — $X",
//     or, once bought, "Open the record" + "Did you win?").
// The Ritualist's route is not imported (it would pull the Ritualist's module
// into ink's bundle) and not touched; the status words are its words, copied.
//
// Every visible string that is ink's own is PLACEHOLDER copy — Sam's words.

import { useState } from "react";
import { Badge, BlockStack, Box, IndexTable, InlineStack, Link, Text } from "@shopify/polaris";
import type { BadgeProps } from "@shopify/polaris";
import { ChevronDown } from "lucide-react";
import OrderExpandedRow from "./OrderExpandedRow";
import RecordDoor, { type RecordDoorProps } from "./RecordDoor";
import type { InkOrderDetail } from "../services/ink-links.server";

export type InkRecentOrderRow = {
  id: string;
  name: string;
  recordUrl: string | null;
  proofId: string | null;
  detail: InkOrderDetail | null;
  door: RecordDoorProps["door"];
};

// The Ritualist's badge words (app.tagged-shipments._index.tsx), unchanged.
const statusBadgeProps: Record<string, { tone: BadgeProps["tone"]; label: string }> = {
  enrolled: { tone: "warning", label: "Enrolled" },
  active: { tone: "info", label: "Enrolled" },
  verified: { tone: "success", label: "Verified" },
  expired: { tone: undefined, label: "Expired" },
  cooldown: { tone: "attention", label: "Cooldown" },
  pending: { tone: undefined, label: "Pending" },
};

const money = (amount: string, currency: string) =>
  parseFloat(amount).toLocaleString("en-US", { style: "currency", currency });

/** The bottom of the accordion: the record, and the door to buy it. */
function RecordFooter({ row, returnTo }: { row: InkRecentOrderRow; returnTo: string }) {
  if (!row.proofId) {
    return (
      <Text as="p" variant="bodySm" tone="subdued">
        {/* PLACEHOLDER copy */}
        No record yet
      </Text>
    );
  }
  return (
    <InlineStack align="space-between" blockAlign="center" gap="400">
      {row.recordUrl ? (
        <Link url={row.recordUrl} target="_blank">
          {/* PLACEHOLDER label */}
          View record
        </Link>
      ) : (
        <span />
      )}
      <RecordDoor proofId={row.proofId} orderName={row.name} returnTo={returnTo} door={row.door} />
    </InlineStack>
  );
}

function Panel({ row, returnTo, onCollapse }: { row: InkRecentOrderRow; returnTo: string; onCollapse: () => void }) {
  const footer = <RecordFooter row={row} returnTo={returnTo} />;
  if (!row.detail) {
    // Only the minimal read answered (protected fields redacted): the door alone.
    return (
      <div style={{ borderTop: "1px solid var(--p-color-border)", padding: "12px 16px", background: "var(--p-color-bg-surface-secondary)" }}>
        {footer}
      </div>
    );
  }
  return (
    <OrderExpandedRow
      order={row.detail}
      onCollapse={onCollapse}
      viewFullUrl={row.recordUrl}
      handoffNote={
        <Text as="p" variant="bodySm" tone="subdued">
          {/* PLACEHOLDER copy */}
          Every open of this order's tracking link, and where it happened, is in its record.
        </Text>
      }
      footer={footer}
    />
  );
}

export default function InkRecentOrders({
  orders,
  returnTo = "/app/ink",
  defaultExpandedId = null,
}: {
  orders: InkRecentOrderRow[];
  returnTo?: string;
  /** Tests (and a deep link, one day) open a row on first render. */
  defaultExpandedId?: string | null;
}) {
  const [expandedOrder, setExpandedOrder] = useState<string | null>(defaultExpandedId);
  const toggle = (id: string) => setExpandedOrder((prev) => (prev === id ? null : id));
  const badgeFor = (row: InkRecentOrderRow) => {
    const status = row.detail?.status ?? (row.proofId ? "enrolled" : "pending");
    return statusBadgeProps[status] || { tone: undefined, label: status };
  };

  const tableRows = orders.flatMap((row, index) => {
    const isExpanded = expandedOrder === row.id;
    const badge = badgeFor(row);
    const d = row.detail;
    const tr = (
      <IndexTable.Row id={row.id} key={row.id} position={index} onClick={() => toggle(row.id)} selected={false}>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="semibold" as="span">
            {row.name}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div>
            <Text variant="bodyMd" as="span">
              {d ? d.customerName : "—"}
            </Text>
            <br />
            <Text variant="bodySm" tone="subdued" as="span">
              {d?.customerEmail ?? ""}
            </Text>
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span">
            {d?.date || "—"}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span" alignment="end">
            {d ? money(d.total, d.currency) : "—"}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
    if (!isExpanded) return [tr];
    return [
      tr,
      <tr key={`${row.id}-expanded`}>
        <td colSpan={5} style={{ padding: 0 }}>
          <Panel row={row} returnTo={returnTo} onCollapse={() => setExpandedOrder(null)} />
        </td>
      </tr>,
    ];
  });

  return (
    <>
      {/* Desktop table — the Ritualist's */}
      <div className="hidden lg:block">
        <IndexTable
          resourceName={{ singular: "order", plural: "orders" }}
          itemCount={orders.length}
          emptyState={
            <Box padding="400">
              <BlockStack gap="200" inlineAlign="center">
                {/* PLACEHOLDER copy */}
                <Text as="p" tone="subdued">
                  No orders yet.
                </Text>
              </BlockStack>
            </Box>
          }
          headings={[
            { title: "Order" },
            { title: "Customer" },
            { title: "Date" },
            { title: "Total", alignment: "end" },
            { title: "Status" },
          ]}
          selectable={false}
        >
          {tableRows}
        </IndexTable>
      </div>

      {/* Mobile cards — the Ritualist's */}
      <div className="lg:hidden space-y-2 p-2">
        {orders.length === 0 ? (
          <Box padding="400">
            {/* PLACEHOLDER copy */}
            <Text as="p" tone="subdued">
              No orders yet.
            </Text>
          </Box>
        ) : (
          orders.map((row) => {
            const isExpanded = expandedOrder === row.id;
            const badge = badgeFor(row);
            const d = row.detail;
            return (
              <div key={row.id}>
                <div
                  className={`bg-card border cursor-pointer transition-colors ${
                    isExpanded ? "border-foreground" : "border-border hover:bg-secondary"
                  }`}
                  onClick={() => toggle(row.id)}
                >
                  <div className={`px-4 py-3 ${isExpanded ? "bg-muted" : ""}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{row.name}</span>
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{d ? d.customerName : "—"}</span>
                      <span className="font-medium text-foreground">{d ? money(d.total, d.currency) : ""}</span>
                    </div>
                    {d?.date ? <span className="text-xs text-muted-foreground">{d.date}</span> : null}
                  </div>
                </div>
                {isExpanded && <Panel row={row} returnTo={returnTo} onCollapse={() => setExpandedOrder(null)} />}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
