import { useState } from "react";
import {
  BlockStack,
  Box,
  Button,
  Collapsible,
  Divider,
  InlineGrid,
  InlineStack,
  Text,
} from "@shopify/polaris";
import InkRecordDoor, { type InkDoor } from "./InkRecordDoor";
import { RecordWords as EvidenceWords, type WordLine } from "./InkRecordEvidence";
import InkRecordInspection from "./InkRecordInspection";
import type { InkOrderDetail } from "../services/ink-links.server";
import type { DisputePacketText } from "../services/ink-packet.server";
import {
  LifecycleRail,
  DeliveryWindowBar,
  type OrderTimelineData,
} from "./OrderTimeline";
import InkOpens from "./InkOpens";
import { opensOf, type RecordRead } from "../lib/record-words";
import { INK_DATA, INK_DATA_TINT } from "../lib/ink-palette";
import { checkoutLines } from "../lib/checkout-words";

export type InkRecentOrderRow = {
  id: string;
  name: string;
  proofId: string | null;
  detail: InkOrderDetail | null;
  record: RecordRead | null;
  door: InkDoor;
  packet?: DisputePacketText | null;
  timeline?: OrderTimelineData | null;
};
const money = (amount: string, currency: string) => {
  const value = Number.parseFloat(amount);
  if (!Number.isFinite(value)) return "Unavailable";
  try {
    return value.toLocaleString("en-US", { style: "currency", currency });
  } catch {
    return "Unavailable";
  }
};
function checkoutWords(record: RecordRead | null): WordLine[] | null {
  return record?.checkout ? checkoutLines(record.checkout) : null;
}

/** The record's words, and the checkout beside the opens when the backend's
 *  words carry it (#134). */
export function RecordWords({ record }: { record: RecordRead | null }) {
  return <EvidenceWords record={record} checkout={checkoutWords(record)} />;
}

// A bought record's texts for Shopify's dispute form, each with its Copy button.
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

/** A bought record's three texts: each one Shopify's dispute form asks for,
 *  ready to paste, with its own Copy button. It is called the record. */
export function DisputePacketView({ packet }: { packet: DisputePacketText }) {
  // PLACEHOLDER labels — Shopify's dispute form's own field names.
  const fields = [
    { key: "accessActivityLog", label: "Access activity log", text: packet.accessActivityLog },
    { key: "shippingDocumentation", label: "Shipping documentation", text: packet.shippingDocumentation },
    { key: "uncategorizedText", label: "Additional information", text: packet.uncategorizedText },
  ].filter((f) => f.text);
  return (
    <BlockStack gap="300">
      <Text as="h3" variant="headingMd">
        {/* Sam, 2026-09-23: "its called the record" — never "dispute packet". */}
        The record
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
function Panel({ row, mapsKey }: { row: InkRecentOrderRow; mapsKey: string | null }) {
  const [advanced, setAdvanced] = useState(true);
  const d = row.detail;
  const openCount = opensOf(row.record);
  const address = d?.customerAddress;
  const addressLabel = address
    ? [
        address.address1,
        address.address2,
        address.city,
        address.provinceCode,
        address.zip,
        address.country,
      ]
        .filter(Boolean)
        .join(", ")
    : "Address unavailable";
  return (
    <Box padding="400">
      <BlockStack gap="500">
        {d ? (
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">
                Recipient
              </Text>
              <Text as="p" breakWord>
                {d.customerName}
              </Text>
              <Text as="p" breakWord>
                {`Order email: ${d.customerEmail || "Unavailable"}`}
              </Text>
              <Text as="p" breakWord>
                {addressLabel}
              </Text>
            </BlockStack>
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">
                Products
              </Text>
              {d.items.map((item, i) => (
                <Text
                  key={i}
                  as="p"
                  breakWord
                >{`${item.title} · Quantity ${item.quantity}`}</Text>
              ))}
              {!d.items.length && (
                <Text as="p" tone="subdued">
                  Product details are unavailable.
                </Text>
              )}
              {d.itemsTruncated && (
                <Text as="p" tone="subdued">
                  Showing the first 20 products.
                </Text>
              )}
              <Text
                as="p"
                fontWeight="semibold"
              >{`Order total ${money(d.total, d.currency)}`}</Text>
            </BlockStack>
          </InlineGrid>
        ) : (
          <Text as="p" tone="subdued">
            Recipient and product details are unavailable.
          </Text>
        )}
        {row.timeline ? (
          <Box padding="400" background="bg" borderRadius="200">
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">
                Order activity
              </Text>
              <LifecycleRail steps={row.timeline.steps} />
            </BlockStack>
          </Box>
        ) : row.proofId ? (
          <Text as="p" tone="subdued">
            Order activity is unavailable. Refresh to try again.
          </Text>
        ) : (
          <Text as="p" tone="subdued">
            No record is linked to this order.
          </Text>
        )}
        {row.proofId && (
          <>
            <Divider />
            <Box background="bg" padding="300" borderRadius="200">
              <InlineStack align="space-between" blockAlign="center">
                <Button
                  variant="plain"
                  textAlign="left"
                  disclosure={advanced ? "up" : "down"}
                  ariaExpanded={advanced}
                  ariaControls={`advanced-${d?.id || row.id}`}
                  onClick={() => setAdvanced((v) => !v)}
                >
                  Advanced
                </Button>
                <Text as="span" tone="subdued">
                  {openCount == null
                    ? "Opens unavailable"
                    : `${openCount} ${openCount === 1 ? "open" : "opens"}`}
                </Text>
              </InlineStack>
            </Box>
            <Collapsible id={`advanced-${d?.id || row.id}`} open={advanced}>
              {advanced && (
                <BlockStack gap="400">
                  <InkRecordDoor proofId={row.proofId} door={row.door} />
                  {row.door.purchase && row.packet ? (
                    <>
                      <Divider />
                      <DisputePacketView packet={row.packet} />
                    </>
                  ) : null}
                  <Divider />
                  {row.record && !row.record.locked ? (
                    <InkRecordInspection
                      proofId={row.proofId}
                      record={row.record}
                      timeline={row.timeline}
                      addressLabel={addressLabel}
                      checkout={checkoutWords(row.record)}
                      mapsKey={mapsKey}
                    />
                  ) : (
                    <>
                      <RecordWords record={row.record} />
                      {row.timeline && (
                        <>
                          <Divider />
                          {/* THE OPEN and EVERY OPEN — the record page's open section (components/InkOpens.tsx). */}
                          <InkOpens
                            record={row.record}
                            timeline={row.timeline}
                            addressLabel={addressLabel}
                            mapsKey={mapsKey}
                          />
                        </>
                      )}
                    </>
                  )}
                  {row.timeline?.window && (
                    <>
                      <Divider />
                      <DeliveryWindowBar w={row.timeline.window} />
                    </>
                  )}
                </BlockStack>
              )}
            </Collapsible>
          </>
        )}
      </BlockStack>
    </Box>
  );
}
export default function InkRecentOrders({
  orders,
  defaultExpandedId = null,
  searching = false,
  mapsKey = null,
}: {
  orders: InkRecentOrderRow[];
  returnTo?: string;
  defaultExpandedId?: string | null;
  searching?: boolean;
  /** The Maps JavaScript browser key (GOOGLE_MAPS_BROWSER_KEY); none → no map, the words remain. */
  mapsKey?: string | null;
}) {
  const [expanded, setExpanded] = useState(defaultExpandedId);
  if (!orders.length)
    return (
      <Box padding="400">
        <Text as="p">
          {searching
            ? "No orders match this search. Try another order number, name or email, or clear the search."
            : "No orders are available from the past 60 days."}
        </Text>
      </Box>
    );
  return (
    <Box paddingInline="400" paddingBlockEnd="400">
      <BlockStack gap="300">
        {orders.map((row) => {
          const open = expanded === row.id;
          const count = opensOf(row.record);
          return (
            <div
              key={row.id}
              style={{
                border: `1px solid ${open ? INK_DATA : "var(--p-color-border)"}`,
                borderRadius: "var(--p-border-radius-200)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "var(--p-space-300)",
                  background: open ? INK_DATA_TINT : "var(--p-color-bg-surface-secondary)",
                }}
              >
                <InlineGrid
                  columns={{
                    xs: "84px minmax(0, 1fr) 78px",
                    sm: "110px minmax(0, 1fr) 120px",
                  }}
                  gap="200"
                  alignItems="center"
                >
                  <BlockStack gap="100">
                    <Box color="text">
                      <Button
                        id={`order-toggle-${row.id}`}
                        variant="tertiary"
                        size="medium"
                        textAlign="left"
                        disclosure={open ? "up" : "down"}
                        ariaExpanded={open}
                        ariaControls={`order-${row.id}`}
                        onClick={() => setExpanded(open ? null : row.id)}
                      >
                        {row.name}
                      </Button>
                    </Box>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {row.detail?.date || "Date unavailable"}
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="headingSm" breakWord>
                      <Text as="span" visuallyHidden>
                        Recipient{" "}
                      </Text>
                      {row.detail?.customerName &&
                      row.detail.customerName !== "Name unavailable"
                        ? row.detail.customerName
                        : "Recipient unavailable"}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued" breakWord>
                      {row.detail?.customerEmail || "Email unavailable"}
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text
                      as="p"
                      alignment="end"
                      fontWeight="semibold"
                      breakWord
                    >
                      {row.detail
                        ? money(row.detail.total, row.detail.currency)
                        : "Total unavailable"}
                    </Text>
                    <Text as="p" variant="bodySm" alignment="end" breakWord>
                      {count == null
                        ? "Opens unavailable"
                        : `${count} ${count === 1 ? "open" : "opens"}`}
                    </Text>
                  </BlockStack>
                </InlineGrid>
              </div>
              <Collapsible id={`order-${row.id}`} open={open}>
                {open && (
                  <>
                    <Divider />
                    <Panel row={row} mapsKey={mapsKey} />
                  </>
                )}
              </Collapsible>
            </div>
          );
        })}
      </BlockStack>
    </Box>
  );
}
