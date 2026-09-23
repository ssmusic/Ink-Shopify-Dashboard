// INK'S ORDERS — THE RITUALIST'S SHIPMENTS LIST, EACH ROW OPENING ON ITS RECORD.
//
// Sam, 2026-09-23: "recent orders should show just like the ritualist orders
// with an accordion and the get the record at the bottom of the accordion" ·
// "enrolled and verified and all that bs is from when this was nfc - remove" ·
// "we're doing everything inside this shopify app" · "we need to be showing
// the record" · "can we have a full record open?".
//
// So: the markup of routes/app.tagged-shipments._index.tsx — the IndexTable,
// the click-to-expand row, the mobile cards, the same expanded panel
// (components/OrderExpandedRow.tsx) — with what the RECORD says in place of
// the NFC-era status: the table's last two columns are the opens and the
// location word, and the panel's right-hand column is the whole record in
// words (lib/record-words.ts, the public record page's own words). Nothing
// links out of the app. The bottom of the accordion is the record's door:
// "Get the record — $X", or once bought "Open the record" + "Did you win?".
//
// Every visible string that is ink's own is PLACEHOLDER copy — Sam's words.

import { useState } from "react";
import { BlockStack, Box, Button, IndexTable, InlineStack, Text } from "@shopify/polaris";
import { ChevronDown } from "lucide-react";
import OrderExpandedRow from "./OrderExpandedRow";
import RecordDoor, { type RecordDoorProps } from "./RecordDoor";
import type { InkOrderDetail } from "../services/ink-links.server";
import type { DisputePacketText } from "../services/ink-packet.server";
import OrderTimeline, { type OrderTimelineData } from "./OrderTimeline";
import { LEVEL_WORDS, elementLines, locationWordOf, opensOf, type RecordRead } from "../lib/record-words";

export type InkRecentOrderRow = {
  id: string;
  name: string;
  proofId: string | null;
  detail: InkOrderDetail | null;
  record: RecordRead | null;
  door: RecordDoorProps["door"];
  /** A bought record's dispute packet, read inside the app. */
  packet?: DisputePacketText | null;
  /** The order's timeline: the rail, the opens on a map, the delivery window. */
  timeline?: OrderTimelineData | null;
};

const money = (amount: string, currency: string) =>
  parseFloat(amount).toLocaleString("en-US", { style: "currency", currency });

/** The whole record, in the public record page's words. */
export function RecordWords({ record }: { record: RecordRead | null }) {
  if (!record) {
    return (
      <Text as="p" variant="bodySm" tone="subdued">
        {/* PLACEHOLDER copy */}
        No record yet.
      </Text>
    );
  }
  return (
    <BlockStack gap="300">
      <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">
        {/* PLACEHOLDER copy — the section's name, as CUSTOMER and PRODUCTS are named */}
        THE RECORD
      </Text>
      {record.elements.map((el) => (
        <div key={el.element} style={{ borderTop: "1px solid var(--p-color-border)", paddingTop: "8px" }}>
          <BlockStack gap="100">
            <InlineStack align="space-between" blockAlign="baseline" gap="200">
              <Text as="p" variant="bodySm" fontWeight="semibold">
                {el.label}
              </Text>
              <Text as="span" variant="bodyXs" tone="subdued">
                {(LEVEL_WORDS[el.status] ?? el.status).toUpperCase()}
              </Text>
            </InlineStack>
            {elementLines(el).map((line) => (
              <InlineStack key={line.label} align="space-between" gap="200" wrap={false}>
                <Text as="span" variant="bodySm" tone="subdued">
                  {line.label}
                </Text>
                <Text as="span" variant="bodySm" alignment="end">
                  {line.words}
                </Text>
              </InlineStack>
            ))}
          </BlockStack>
        </div>
      ))}
    </BlockStack>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="slim"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => {},
        );
      }}
    >
      {/* PLACEHOLDER labels */}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

/** A bought record's dispute packet: each text Shopify's dispute form asks
 *  for, ready to paste, with its own Copy button. */
export function DisputePacketView({ packet }: { packet: DisputePacketText }) {
  // PLACEHOLDER labels — Shopify's dispute form's own field names.
  const fields = [
    { key: "accessActivityLog", label: "Access activity log", text: packet.accessActivityLog },
    { key: "shippingDocumentation", label: "Shipping documentation (attach as a file)", text: packet.shippingDocumentation },
    { key: "uncategorizedText", label: "Additional information", text: packet.uncategorizedText },
  ].filter((f) => f.text);
  return (
    <BlockStack gap="300">
      <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">
        {/* PLACEHOLDER copy */}
        DISPUTE PACKET
      </Text>
      {fields.map((f) => (
        <BlockStack key={f.key} gap="100">
          <InlineStack align="space-between" blockAlign="center" gap="200">
            <Text as="p" variant="bodySm" fontWeight="semibold">
              {f.label}
            </Text>
            <CopyButton text={f.text} />
          </InlineStack>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: "12px",
              lineHeight: 1.5,
              padding: "8px 12px",
              borderRadius: "8px",
              background: "var(--p-color-bg-surface)",
              border: "1px solid var(--p-color-border)",
            }}
          >
            {f.text}
          </pre>
        </BlockStack>
      ))}
    </BlockStack>
  );
}

/** The bottom of the accordion: the record's door — or, once bought, the
 *  record's dispute packet, in the app. */
function RecordFooter({ row, returnTo }: { row: InkRecentOrderRow; returnTo: string }) {
  if (!row.proofId) return null;
  if (!row.door.offerLine && !row.door.purchase) return null;
  const door = <RecordDoor proofId={row.proofId} orderName={row.name} returnTo={returnTo} door={row.door} hidePacketLink={Boolean(row.packet)} />;
  if (row.door.purchase && row.packet) {
    return (
      <BlockStack gap="300">
        <DisputePacketView packet={row.packet} />
        <InlineStack align="end" blockAlign="center">
          {door}
        </InlineStack>
      </BlockStack>
    );
  }
  return (
    <InlineStack align="end" blockAlign="center">
      {door}
    </InlineStack>
  );
}

function Panel({ row, returnTo, onCollapse }: { row: InkRecentOrderRow; returnTo: string; onCollapse: () => void }) {
  const footer = <RecordFooter row={row} returnTo={returnTo} />;
  const timeline = row.timeline ? <OrderTimeline data={row.timeline} /> : null;
  if (!row.detail) {
    // Only the minimal order read answered (protected fields redacted): the record alone.
    return (
      <div style={{ borderTop: "1px solid var(--p-color-border)" }}>
        <Box padding="400">
          <RecordWords record={row.record} />
        </Box>
        {timeline ? <div style={{ borderTop: "1px solid var(--p-color-border)" }}>{timeline}</div> : null}
        <div style={{ borderTop: "1px solid var(--p-color-border)", padding: "12px 16px", background: "var(--p-color-bg-surface-secondary)" }}>
          {footer}
        </div>
      </div>
    );
  }
  return (
    <OrderExpandedRow
      order={row.detail}
      onCollapse={onCollapse}
      aside={<RecordWords record={row.record} />}
      below={timeline}
      footer={footer}
      uncapped
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
  /** A row opened on first render (the listing screenshot; a deep link one day). */
  defaultExpandedId?: string | null;
}) {
  const [expandedOrder, setExpandedOrder] = useState<string | null>(defaultExpandedId);
  const toggle = (id: string) => setExpandedOrder((prev) => (prev === id ? null : id));

  const tableRows = orders.flatMap((row, index) => {
    const isExpanded = expandedOrder === row.id;
    const d = row.detail;
    const opens = opensOf(row.record);
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
          <Text variant="bodyMd" as="span" alignment="end">
            {opens ?? "—"}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span">
            {row.proofId ? locationWordOf(row.record) || "—" : "—"}
          </Text>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
    if (!isExpanded) return [tr];
    return [
      tr,
      <tr key={`${row.id}-expanded`}>
        <td colSpan={6} style={{ padding: 0 }}>
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
            // PLACEHOLDER headings — the record's two facts a row can carry.
            { title: "Opens", alignment: "end" },
            { title: "Location" },
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
            const d = row.detail;
            const opens = opensOf(row.record);
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
                      <span className="font-semibold text-sm text-foreground">{row.name}</span>
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{d ? d.customerName : "—"}</span>
                      <span className="font-medium text-foreground">{d ? money(d.total, d.currency) : ""}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{d?.date ?? ""}</span>
                      {/* PLACEHOLDER copy */}
                      <span>
                        {opens != null ? `${opens} ${opens === 1 ? "open" : "opens"}` : ""}
                        {row.proofId && locationWordOf(row.record) ? ` · ${locationWordOf(row.record)}` : ""}
                      </span>
                    </div>
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
