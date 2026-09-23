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
  TextField,
} from "@shopify/polaris";
import InkRecordDoor, { type InkDoor } from "./InkRecordDoor";
import { RecordWords } from "./InkRecordEvidence";
import InkRecordInspection from "./InkRecordInspection";
import type { InkOrderDetail } from "../services/ink-links.server";
import type { DisputePacketText } from "../services/ink-packet.server";
import {
  LifecycleRail,
  DeliveryWindowBar,
  OpensAgainstAddress,
  type OrderTimelineData,
} from "./OrderTimeline";
import { opensOf, type RecordRead } from "../lib/record-words";

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
export { RecordWords } from "./InkRecordEvidence";

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
                  <Divider />
                  {row.door.downloadable ? (
                    <InkRecordInspection
                      proofId={row.proofId}
                      record={row.record}
                      timeline={row.timeline}
                      addressLabel={addressLabel}
                    />
                  ) : (
                    <>
                      <RecordWords record={row.record} />
                      {row.timeline && (
                        <>
                          <Divider />
                          <OpensAgainstAddress
                            address={row.timeline.address}
                            opens={row.timeline.opens}
                            available={row.timeline.opensAvailable}
                            capped={row.timeline.opensCapped}
                            addressLabel={addressLabel}
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
    <Box paddingInline="400" paddingBlockEnd="400">
      <BlockStack gap="300">
        {orders.map((row) => {
          const open = expanded === row.id;
          const count = opensOf(row.record);
          return (
            <Box
              key={row.id}
              borderWidth="025"
              borderColor={open ? "border-info" : "border"}
              borderRadius="200"
              overflowX="hidden"
              overflowY="hidden"
            >
              <Box
                padding="400"
                background={open ? "bg-surface-info" : "bg-surface-secondary"}
              >
                <InlineGrid
                  columns={{
                    xs: "100px minmax(0, 1fr)",
                    md: "100px minmax(0, 1fr) 140px 120px",
                  }}
                  gap="400"
                  alignItems="center"
                >
                  <Box color="text">
                    <Button
                      variant="tertiary"
                      size="large"
                      textAlign="left"
                      disclosure={open ? "up" : "down"}
                      ariaExpanded={open}
                      ariaControls={`order-${row.id}`}
                      onClick={() => setExpanded(open ? null : row.id)}
                    >
                      {row.name}
                    </Button>
                  </Box>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Recipient
                    </Text>
                    <Text as="p" variant="headingSm" breakWord>
                      {row.detail?.customerName &&
                      row.detail.customerName !== "Name unavailable"
                        ? row.detail.customerName
                        : "Recipient unavailable"}
                    </Text>
                    <Text as="p" tone="subdued" breakWord>
                      {row.detail?.customerEmail || "Email unavailable"}
                    </Text>
                  </BlockStack>
                  <Text as="p">{row.detail?.date || "Date unavailable"}</Text>
                  <BlockStack gap="100">
                    <Text as="p" fontWeight="semibold">
                      {row.detail
                        ? money(row.detail.total, row.detail.currency)
                        : "Total unavailable"}
                    </Text>
                    <Box color="text-info">
                      <Text as="p">
                        {count == null
                          ? "Opens unavailable"
                          : `${count} ${count === 1 ? "open" : "opens"}`}
                      </Text>
                    </Box>
                  </BlockStack>
                </InlineGrid>
              </Box>
              <Collapsible id={`order-${row.id}`} open={open}>
                {open && (
                  <>
                    <Divider />
                    <Panel row={row} />
                  </>
                )}
              </Collapsible>
            </Box>
          );
        })}
      </BlockStack>
    </Box>
  );
}
