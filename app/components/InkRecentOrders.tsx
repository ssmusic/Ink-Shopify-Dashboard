// INK'S ORDERS — each order a bordered row that opens on its record.
//
// Sam, 2026-09-23: "recent orders should show just like the ritualist orders
// with an accordion and the get the record at the bottom of the accordion" ·
// "enrolled and verified and all that bs is from when this was nfc - remove" ·
// "we're doing everything inside this shopify app" · "we need to be showing
// the record" · "can we have a full record open?"; then, of this screen: "the
// little order numbers with the accordion need to look like cells - maybe
// they need a hairline box around them" · "the order number should be black
// and we should see the name clearly" · "if this is the phone - it needs to be
// spread out horizontaly not so tall" · "you have to make the page more
// legible with background shading - some sections grey some white" · "the
// ritualist does the advanced thing already and it looks pretty good" · "i
// want it all" · "this page should be blue highlights like the insights page".
//
// So each row is a hairline box: the order number (black), its date; the
// recipient's name and the order's email; the total, the opens and the
// open's distance. Opened, it shows the recipient and the products, the rail
// (no title — "THE ORDER, STEP BY STEP is weird"), and Advanced: the record's
// door, then the whole record in words — the elements, the checkout beside the
// opens, the checks against the published key, every signed event — with
// every open listed beside the map, and the delivery window. Once the
// hand-over is the merchant's (bought, or free), Advanced opens the signed
// events themselves (components/InkRecordInspection.tsx).
//
// THE MERCHANT SEES THE WHOLE RECORD (Sam, 2026-09-23: "the 29 gets it
// signed"; ink-backend #129); what the price buys is the hand-over
// (lib/record-handover.ts). The row's highlight is the palette's one blue
// (lib/ink-palette.ts). Only this file reads the checkout's words
// (lib/checkout-words.ts): the Ritualist never prints them.
//
// Every visible string that is ink's own is PLACEHOLDER copy — Sam's words.

import { useState, type ReactNode } from "react";
import { BlockStack, Box, Button, Collapsible, Divider, InlineGrid, InlineStack, Text } from "@shopify/polaris";
import InkRecordDoor, { type InkDoor } from "./InkRecordDoor";
import { RecordWords as EvidenceWords, RecordChecksWords, RecordEventWords, type WordLine } from "./InkRecordEvidence";
import InkRecordInspection from "./InkRecordInspection";
import type { InkOrderDetail } from "../services/ink-links.server";
import type { DisputePacketText } from "../services/ink-packet.server";
import { LifecycleRail, DeliveryWindowBar, OpensAgainstAddress, type OrderTimelineData } from "./OrderTimeline";
import { browsersLine, locationWordOf, opensOf, type RecordRead } from "../lib/record-words";
import { checkoutLines } from "../lib/checkout-words";
import { INK_DATA, INK_DATA_TINT } from "../lib/ink-palette";

export type InkRecentOrderRow = {
  id: string;
  name: string;
  proofId: string | null;
  detail: InkOrderDetail | null;
  record: RecordRead | null;
  door: InkDoor;
  /** A bought record's dispute packet, read inside the app. */
  packet?: DisputePacketText | null;
  /** The order's timeline: the rail, the opens beside the map, the delivery window. */
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

/** The checkout beside the opens, in words — only when the backend's words carry it. */
function checkoutWords(record: RecordRead | null): WordLine[] | null {
  return record?.checkout ? checkoutLines(record.checkout) : null;
}

/** The whole record, in the public record page's words, with the checkout's lines after the open. */
export function RecordWords({ record }: { record: RecordRead | null }) {
  return <EvidenceWords record={record} checkout={checkoutWords(record)} />;
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

/** A grey section inside the panel ("some sections grey some white"). */
function Shaded({ children }: { children: ReactNode }) {
  return (
    <Box background="bg" padding="400" borderRadius="200">
      {children}
    </Box>
  );
}

function Panel({ row, mapsKey }: { row: InkRecentOrderRow; mapsKey: string | null }) {
  const [advanced, setAdvanced] = useState(true);
  const d = row.detail;
  const openCount = opensOf(row.record);
  const address = d?.customerAddress;
  const addressLabel = address
    ? [address.address1, address.address2, address.city, address.provinceCode, address.zip, address.country].filter(Boolean).join(", ")
    : "Address unavailable";
  const checkout = checkoutWords(row.record);
  const browsers = browsersLine(row.record?.browsers);
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
                <Text key={i} as="p" breakWord>{`${item.title} · Quantity ${item.quantity}`}</Text>
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
              <Text as="p" fontWeight="semibold">{`Order total ${money(d.total, d.currency)}`}</Text>
            </BlockStack>
          </InlineGrid>
        ) : (
          <Text as="p" tone="subdued">
            Recipient and product details are unavailable.
          </Text>
        )}
        {row.timeline ? (
          // The rail — no title over it.
          <Shaded>
            <LifecycleRail steps={row.timeline.steps} />
          </Shaded>
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
                  {openCount == null ? "Opens unavailable" : `${openCount} ${openCount === 1 ? "open" : "opens"}`}
                </Text>
              </InlineStack>
            </Box>
            <Collapsible id={`advanced-${d?.id || row.id}`} open={advanced}>
              {advanced && (
                <BlockStack gap="400">
                  <InkRecordDoor proofId={row.proofId} door={row.door} />
                  <Divider />
                  {/* The signed events themselves are the hand-over's: shown once it is
                      the merchant's (Sam, 2026-09-23: "they need to see all the info but
                      not get the signed hash"). */}
                  {row.door.downloadable ? (
                    <InkRecordInspection
                      proofId={row.proofId}
                      record={row.record}
                      timeline={row.timeline}
                      addressLabel={addressLabel}
                      checkout={checkout}
                      mapsKey={mapsKey}
                      browsers={browsers}
                    />
                  ) : (
                    <>
                      <EvidenceWords record={row.record} checkout={checkout} />
                      {row.record?.checks ? (
                        <Shaded>
                          <RecordChecksWords checks={row.record.checks} />
                        </Shaded>
                      ) : null}
                      {row.timeline ? (
                        <>
                          <Divider />
                          <OpensAgainstAddress
                            address={row.timeline.address}
                            opens={row.timeline.opens}
                            available={row.timeline.opensAvailable ?? true}
                            capped={row.timeline.opensCapped ?? false}
                            addressLabel={addressLabel}
                            mapsKey={mapsKey}
                            browsers={browsers}
                          />
                        </>
                      ) : null}
                      {row.record?.events && row.record.events.length > 0 ? (
                        <Shaded>
                          <RecordEventWords events={row.record.events} />
                        </Shaded>
                      ) : null}
                    </>
                  )}
                  {row.packet ? (
                    // A bought record's three texts for Shopify's dispute form, under the record's words.
                    <>
                      <Divider />
                      <DisputePacketView packet={row.packet} />
                    </>
                  ) : null}
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
  /** A row opened on first render (the listing screenshot; a deep link one day). */
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
          // The open's distance (or what its location says) — never a judgment of it.
          const place = row.proofId ? locationWordOf(row.record) : "";
          return (
            <div
              key={row.id}
              data-order-row={row.id}
              style={{
                border: `1px solid ${open ? INK_DATA : "var(--p-color-border)"}`,
                borderRadius: "var(--p-border-radius-200)",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "var(--p-space-300)", background: open ? INK_DATA_TINT : "var(--p-color-bg-surface-secondary)" }}>
                <InlineGrid columns={{ xs: "84px minmax(0, 1fr) 84px", sm: "110px minmax(0, 1fr) 128px" }} gap="200" alignItems="center">
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
                      {row.detail?.customerName && row.detail.customerName !== "Name unavailable" ? row.detail.customerName : "Recipient unavailable"}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued" breakWord>
                      {row.detail?.customerEmail || "Email unavailable"}
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" alignment="end" fontWeight="semibold" breakWord>
                      {row.detail ? money(row.detail.total, row.detail.currency) : "Total unavailable"}
                    </Text>
                    <Text as="p" variant="bodySm" alignment="end" breakWord>
                      {count == null ? "Opens unavailable" : `${count} ${count === 1 ? "open" : "opens"}`}
                    </Text>
                    {place && place !== "—" ? (
                      <Text as="p" variant="bodySm" tone="subdued" alignment="end" breakWord>
                        {place}
                      </Text>
                    ) : null}
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
