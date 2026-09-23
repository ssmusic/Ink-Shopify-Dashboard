import { useState } from "react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Collapsible,
  Divider,
  InlineGrid,
  InlineStack,
  Text,
  TextField,
} from "@shopify/polaris";
import InkRecordDoor, { type InkDoor } from "./InkRecordDoor";
import type { InkOrderDetail } from "../services/ink-links.server";
import type { DisputePacketText } from "../services/ink-packet.server";
import OrderTimeline, { type OrderTimelineData } from "./OrderTimeline";
import {
  LEVEL_WORDS,
  elementLines,
  locationWordOf,
  opensOf,
  when,
  type RecordRead,
} from "../lib/record-words";

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
export function RecordWords({ record }: { record: RecordRead | null }) {
  if (!record)
    return (
      <Text as="p" tone="subdued">
        Record details are unavailable. Refresh to try again.
      </Text>
    );
  return (
    <BlockStack gap="400">
      <Text as="h3" variant="headingMd">
        Record details
      </Text>
      <Text as="p" tone="subdued">
        Evidence levels reported by the record.
      </Text>
      {record.elements.map((el) => (
        <BlockStack key={el.element} gap="200">
          <Divider />
          <InlineStack align="space-between" gap="200">
            <Text as="h4" variant="headingSm">
              {el.label}
            </Text>
            <Badge tone="info">{LEVEL_WORDS[el.status] || "Unknown"}</Badge>
          </InlineStack>
          {elementLines(el).map((line, i) => (
            <InlineGrid
              key={i}
              columns={{ xs: 1, sm: ["oneThird", "twoThirds"] }}
              gap="100"
            >
              <Text as="p" tone="subdued">
                {line.label}
              </Text>
              <Text as="p" breakWord>
                {line.words}
              </Text>
            </InlineGrid>
          ))}
        </BlockStack>
      ))}
      {!record.locked && typeof record.eventCount === "number" && (
        <BlockStack gap="300">
          <Divider />
          <Text as="h3" variant="headingMd">Recorded events</Text>
          <Text as="p" tone="subdued">
            {`${record.eventCount} events reported by ink. Signatures and hashes are listed as supplied; this screen does not verify them independently.`}
          </Text>
          {record.events?.map((event) => (
            <BlockStack key={event.id} gap="100">
              <Text as="h4" variant="headingSm">
                {event.type.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}
              </Text>
              <Text as="p">{when(event.at)}</Text>
              <Text as="p" tone="subdued" breakWord>
                {`${event.id} · ${event.legacy ? "Earlier event" : event.sequence == null ? "Sequence unavailable" : `Sequence ${event.sequence}`} · ${event.signed ? "Signature supplied" : "No signature supplied"} · ${event.hash ? "Hash supplied" : "No hash supplied"}`}
              </Text>
            </BlockStack>
          ))}
          {record.eventCount > (record.events?.length || 0) && (
            <Text as="p" tone="subdued">Showing up to 50 events. Download the JSON file for the complete event list.</Text>
          )}
        </BlockStack>
      )}
    </BlockStack>
  );
}

/** Compatibility renderer for stored packet text. No invented file instruction. */
export function DisputePacketView({ packet }: { packet: DisputePacketText }) {
  return (
    <BlockStack gap="300">
      {[
        ["Access activity log", packet.accessActivityLog],
        ["Shipping documentation", packet.shippingDocumentation],
        ["Additional information", packet.uncategorizedText],
      ]
        .filter(([, text]) => text)
        .map(([label, text]) => (
          <TextField
            key={label}
            label={label}
            value={text}
            multiline
            readOnly
            autoComplete="off"
          />
        ))}
    </BlockStack>
  );
}
function Panel({ row }: { row: InkRecentOrderRow }) {
  const [advanced, setAdvanced] = useState(false);
  const d = row.detail;
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
    <Box padding="400" background="bg-surface-secondary">
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
          <OrderTimeline data={row.timeline} addressLabel={addressLabel} />
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
            <Collapsible id={`advanced-${d?.id || row.id}`} open={advanced}>
              <RecordWords record={row.record} />
            </Collapsible>
            <InkRecordDoor proofId={row.proofId} door={row.door} />
          </>
        )}
      </BlockStack>
    </Box>
  );
}
export default function InkRecentOrders({
  orders,
  defaultExpandedId = null,
}: {
  orders: InkRecentOrderRow[];
  returnTo?: string;
  defaultExpandedId?: string | null;
}) {
  const [expanded, setExpanded] = useState(defaultExpandedId);
  if (!orders.length)
    return (
      <Box padding="400">
        <Text as="p">
          No recent orders. New orders will appear here after installation.
        </Text>
      </Box>
    );
  return (
    <BlockStack gap="0">
      {orders.map((row) => {
        const open = expanded === row.id;
        const count = opensOf(row.record);
        return (
          <BlockStack key={row.id} gap="0">
            <Divider />
            <Box padding="400">
              <BlockStack gap="200">
                <InlineStack
                  align="space-between"
                  gap="300"
                  blockAlign="center"
                >
                  <Button
                    variant="plain"
                    disclosure={open ? "up" : "down"}
                    ariaExpanded={open}
                    ariaControls={`order-${row.id}`}
                    onClick={() => setExpanded(open ? null : row.id)}
                  >
                    {row.name}
                  </Button>
                  <Text as="p">{row.detail?.date || "Date unavailable"}</Text>
                  <Text as="p" fontWeight="semibold">
                    {row.detail
                      ? money(row.detail.total, row.detail.currency)
                      : "Total unavailable"}
                  </Text>
                </InlineStack>
                <InlineStack align="space-between" gap="200">
                  <Text as="p" breakWord>
                    {row.detail?.customerName &&
                    row.detail.customerName !== "Name unavailable"
                      ? `Recipient ${row.detail.customerName}`
                      : "Recipient unavailable"}
                  </Text>
                  <Box color="text-info">
                    <Text as="p">
                      {count == null
                        ? "Opens unavailable"
                        : `${count} ${count === 1 ? "open" : "opens"}`}
                    </Text>
                  </Box>
                </InlineStack>
                {locationWordOf(row.record) && (
                  <Text as="p" tone="subdued">
                    {locationWordOf(row.record)}
                  </Text>
                )}
              </BlockStack>
            </Box>
            <Collapsible id={`order-${row.id}`} open={open}>
              {open && <Panel row={row} />}
            </Collapsible>
          </BlockStack>
        );
      })}
    </BlockStack>
  );
}
