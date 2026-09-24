// INK'S ORDERS — the Ritualist's Orders ledger (the-ritualist src/pages/Orders.tsx),
// in Polaris. Sam, 2026-09-24: "the orders page from the ritualist are sooooooo
// much better. i know we're polaris in the app but can we get something similar?"
//
// What that page does and this one now does too:
//   · one ledger on hairlines, under column headings — never a stack of boxes;
//   · the order number leads, with what was bought under it;
//   · an Activity column says what is happening to the parcel, in the rail's own
//     words (lib/order-activity.ts), and how many times the page was opened;
//   · the whole row opens it; the open row is marked quietly (a line of ink's
//     one blue and its tint, lib/ink-palette.ts);
//   · the open row is a quick glance first — what was bought, and who it went
//     to — then the order's activity and the record (Codex's Advanced, whole);
//   · the phone is its own stacked row, never the desktop squeezed.
//
// Column headings are PLACEHOLDER words (Order · Recipient · Activity · Total ·
// Date) until Sam words them.
import { Suspense, useState, type MouseEvent, type ReactNode } from "react";
import { Await } from "react-router";
import {
  BlockStack,
  Box,
  Button,
  Collapsible,
  Divider,
  InlineGrid,
  InlineStack,
  SkeletonBodyText,
  Text,
  useBreakpoints,
} from "@shopify/polaris";
import { ChevronDownIcon, ChevronRightIcon } from "@shopify/polaris-icons";
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
import { deliveryLine, opensLine } from "../lib/order-activity";
import { ORDER_SORT_OPTIONS, type InkOrderSort } from "../lib/ink-order-search";

/** A row's record side: the record, what the record door offers, a bought
 *  record's packet and the order's activity. */
export type InkRowRecord = {
  record: RecordRead | null;
  door: InkDoor;
  packet?: DisputePacketText | null;
  timeline?: OrderTimelineData | null;
};
type InkOrderBase = {
  id: string;
  name: string;
  proofId: string | null;
  detail: InkOrderDetail | null;
};
export type InkRecentOrderRow = InkOrderBase & InkRowRecord;
/** A row whose record side is on its way: the order screen streams each
 *  row's (routes/app.ink.$section.tsx), so the list shows while the slower
 *  records are still being read. */
export type InkStreamedOrderRow = InkOrderBase & { more: Promise<InkRowRecord> };
export type InkOrderRow = InkRecentOrderRow | InkStreamedOrderRow;

const UNREAD: InkRowRecord = {
  record: null,
  door: { offerLine: null, pending: false, paidPendingRecord: false, resumeUrl: null, downloadable: false, inHistory: false, purchase: null },
  packet: null,
  timeline: null,
};

/** Draws with the row's record side: at once when it is here, else when its
 *  promise lands, with `fallback` until then. A read that failed draws as a
 *  row with no record — the words each part already says for that. The
 *  Ritualist's full-record view waits on its row the same way. */
export function WithRecord({
  row,
  fallback,
  children,
}: {
  row: InkOrderRow;
  fallback: ReactNode;
  children: (row: InkRecentOrderRow) => ReactNode;
}) {
  if (!("more" in row)) return <>{children(row)}</>;
  const { more, ...base } = row;
  return (
    <Suspense fallback={fallback}>
      <Await resolve={more} errorElement={<>{children({ ...base, ...UNREAD })}</>}>
        {(side: InkRowRecord) => children({ ...base, ...side })}
      </Await>
    </Suspense>
  );
}
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

// ── The ledger's geometry ────────────────────────────────────────────────────
// One template for the headings and every row, so each column lines up. Below
// md the same row stacks: the order, its recipient and its activity down the
// left, the total and the date on the right — the Ritualist's phone row.
const ROW = { xs: "minmax(0, 1fr) auto", md: "minmax(0, 1fr) 208px" } as const;
const LEFT = { xs: 1, md: "minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1.35fr)" } as const;
const RIGHT = { xs: 1, md: "minmax(0, 1fr) minmax(0, 1fr)" } as const;
/** The chevron's column: the order number and its heading start after it. */
const CHEVRON = "28px minmax(0, 1fr)";
// The headings' own narrow templates: one line, never the phone row's stack.
// The server draws the desktop ledger; a phone drops the headings once it
// knows its width, so for that moment they are one quiet line.
const LEFT_HEADINGS = { xs: "auto auto auto", md: LEFT.md } as const;
const RIGHT_HEADINGS = { xs: "auto auto", md: RIGHT.md } as const;

/** Which column a sort reads, and the option a press on its heading picks. */
const SORT_HEADINGS = {
  order: { desc: "number_desc", asc: "number_asc" },
  total: { desc: "total_desc", asc: "total_asc" },
  date: { desc: "newest", asc: "oldest" },
} as const satisfies Record<string, { desc: InkOrderSort; asc: InkOrderSort }>;
export type SortColumn = keyof typeof SORT_HEADINGS;
const optionLabel = (value: InkOrderSort) =>
  ORDER_SORT_OPTIONS.find((o) => o.value === value)?.label ?? value;

/** A heading's state under the list's sort, and the sort a press on it picks:
 *  high to low first; on the active column, the order turned round. */
export function headingSort(column: SortColumn, sort: InkOrderSort | undefined) {
  const { desc, asc } = SORT_HEADINGS[column];
  const active: "down" | "up" | null = sort === desc ? "down" : sort === asc ? "up" : null;
  const next: InkOrderSort = active === "down" ? asc : desc;
  return { active, next, nextLabel: optionLabel(next) };
}

function SortHeading({
  column,
  label,
  sort,
  onSort,
}: {
  column: SortColumn;
  label: string;
  sort?: InkOrderSort;
  onSort?: (sort: InkOrderSort) => void;
}) {
  const { active, next, nextLabel } = headingSort(column, sort);
  if (!onSort)
    return (
      <Text as="span" tone="subdued">
        {label}
      </Text>
    );
  // A press sorts by this column — the Ritualist's heading sort, on Codex's options.
  return (
    <Box color={active ? "text" : "text-secondary"}>
      <Button
        variant="monochromePlain"
        size="slim"
        disclosure={active ?? undefined}
        accessibilityLabel={nextLabel}
        onClick={() => onSort(next)}
      >
        {label}
      </Button>
    </Box>
  );
}

function LedgerHeadings({
  sort,
  onSort,
}: {
  sort?: InkOrderSort;
  onSort?: (sort: InkOrderSort) => void;
}) {
  const plain = (label: string) => (
    <Text as="span" tone="subdued">
      {label}
    </Text>
  );
  return (
    <Box paddingInline="300" paddingBlock="200">
      <InlineGrid columns={ROW} gap="400" alignItems="center">
        <InlineGrid columns={LEFT_HEADINGS} gap="400" alignItems="center">
          <InlineGrid columns={CHEVRON} gap="100" alignItems="center">
            <span />
            {/* PLACEHOLDER column headings */}
            <SortHeading column="order" label="Order" sort={sort} onSort={onSort} />
          </InlineGrid>
          {plain("Recipient")}
          {plain("Activity")}
        </InlineGrid>
        <InlineGrid columns={RIGHT_HEADINGS} gap="400" alignItems="center">
          <InlineStack align="end">
            <SortHeading column="total" label="Total" sort={sort} onSort={onSort} />
          </InlineStack>
          <InlineStack align="end">
            <SortHeading column="date" label="Date" sort={sort} onSort={onSort} />
          </InlineStack>
        </InlineGrid>
      </InlineGrid>
    </Box>
  );
}

/** A press anywhere on the row opens it — except on a control of its own, and
 *  except a drag that selected text (an email being copied is not a press). */
export function pressedTheRow(event: Pick<MouseEvent<HTMLElement>, "target">): boolean {
  const target = event.target as HTMLElement | null;
  if (target?.closest("button, a, input, select, textarea, label")) return false;
  const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
  return !(selection && selection.toString().length > 0);
}

function OrderRow({
  row,
  open,
  onToggle,
}: {
  row: InkOrderRow;
  open: boolean;
  onToggle: () => void;
}) {
  const d = row.detail;
  const product = d?.items[0]?.title ?? null;
  const recipient =
    d?.customerName && d.customerName !== "Name unavailable"
      ? d.customerName
      : "Recipient unavailable";
  return (
    <InlineGrid columns={ROW} gap={{ xs: "200", md: "400" }} alignItems="start">
      <InlineGrid columns={LEFT} gap={{ xs: "100", md: "400" }} alignItems="start">
        <InlineGrid columns={CHEVRON} gap="100" alignItems="center">
          <Button
            id={`order-toggle-${row.id}`}
            variant="tertiary"
            size="slim"
            icon={open ? ChevronDownIcon : ChevronRightIcon}
            accessibilityLabel={row.name}
            ariaExpanded={open}
            ariaControls={`order-${row.id}`}
            onClick={onToggle}
          />
          <BlockStack gap="050">
            <Text as="p" variant="headingMd" truncate>
              {row.name}
            </Text>
            {product ? (
              <Text as="p" variant="bodySm" tone="subdued" truncate>
                {product}
              </Text>
            ) : null}
          </BlockStack>
        </InlineGrid>
        <Box paddingInlineStart={{ xs: "800", md: "0" }}>
          <BlockStack gap="050">
            <Text as="p" fontWeight="medium" truncate>
              <Text as="span" visuallyHidden>
                Recipient{" "}
              </Text>
              {recipient}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued" truncate>
              {d?.customerEmail || "Email unavailable"}
            </Text>
          </BlockStack>
        </Box>
        <Box paddingInlineStart={{ xs: "800", md: "0" }}>
          <WithRecord row={row} fallback={<SkeletonBodyText lines={2} />}>
            {(full) => <Activity row={full} />}
          </WithRecord>
        </Box>
      </InlineGrid>
      <InlineGrid columns={RIGHT} gap={{ xs: "050", md: "400" }} alignItems="start">
        <Text as="p" alignment="end" numeric>
          {d ? money(d.total, d.currency) : "Total unavailable"}
        </Text>
        <Text as="p" alignment="end" tone="subdued">
          {d?.date || "Date unavailable"}
        </Text>
      </InlineGrid>
    </InlineGrid>
  );
}

/** The Activity column: how many times the page was opened, and the parcel's
 *  latest word from the order's activity (lib/order-activity.ts). */
function Activity({ row }: { row: InkRecentOrderRow }) {
  const count = opensOf(row.record);
  const delivery = deliveryLine(row.timeline?.steps);
  return (
    <BlockStack gap="050">
      <Text as="p" tone={count ? undefined : "subdued"}>
        {opensLine(count)}
      </Text>
      {delivery ? (
        <Text as="p" variant="bodySm" tone="subdued" truncate>
          {delivery}
        </Text>
      ) : null}
    </BlockStack>
  );
}

/** One line of the order, its product, how many and what they came to. */
function ProductLine({ item, currency }: { item: InkOrderDetail["items"][number]; currency: string }) {
  const unit = Number.parseFloat(item.price);
  const value = Number.isFinite(unit) ? money(String(unit * item.quantity), currency) : null;
  return (
    <InlineGrid columns="minmax(0, 1fr) auto" gap="300" alignItems="start">
      <BlockStack gap="050">
        <Text as="p" breakWord>
          {item.title}
        </Text>
        <Text as="p" variant="bodySm" tone="subdued" breakWord>
          {[item.sku, `Quantity ${item.quantity}`].filter(Boolean).join(" · ")}
        </Text>
      </BlockStack>
      {value && value !== "Unavailable" ? (
        <Text as="p" numeric>
          {value}
        </Text>
      ) : null}
    </InlineGrid>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <BlockStack gap="200">
      <Text as="h3" variant="headingSm">
        {title}
      </Text>
      {children}
    </BlockStack>
  );
}

/** An order, opened: the quick glance, the order's activity, then Advanced.
 *  Both apps draw this one panel — ink's Orders here, the Ritualist's
 *  Shipments row (components/OrderExpandedRow.tsx). What differs is the row's
 *  door, which each loader builds: the Ritualist's record is included, so its
 *  door never offers it and never names a price. */
export function OrderPanel({ row, mapsKey }: { row: InkOrderRow; mapsKey: string | null }) {
  const [advanced, setAdvanced] = useState(true);
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
    <Box padding="400" paddingInlineStart={{ xs: "400", md: "1000" }}>
      <BlockStack gap="500">
        {/* The quick glance first — what was bought, and who it went to — the
            Ritualist's open row. */}
        {d ? (
          <InlineGrid columns={{ xs: 1, md: "minmax(0, 1.25fr) minmax(0, 1fr)" }} gap="600">
            <Section title="Products">
              <BlockStack gap="300">
                {d.items.map((item, i) => (
                  <ProductLine key={i} item={item} currency={d.currency} />
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
                <Divider />
                <InlineGrid columns="minmax(0, 1fr) auto" gap="300">
                  <Text as="p" fontWeight="semibold">
                    Order total
                  </Text>
                  <Text as="p" fontWeight="semibold" numeric>
                    {money(d.total, d.currency)}
                  </Text>
                </InlineGrid>
              </BlockStack>
            </Section>
            <Section title="Recipient">
              <BlockStack gap="100">
                <Text as="p" breakWord>
                  {d.customerName}
                </Text>
                <Text as="p" breakWord>
                  {`Order email: ${d.customerEmail || "Unavailable"}`}
                </Text>
                <Text as="p" breakWord tone="subdued">
                  {addressLabel}
                </Text>
              </BlockStack>
            </Section>
          </InlineGrid>
        ) : (
          <Text as="p" tone="subdued">
            Recipient and product details are unavailable.
          </Text>
        )}
        <WithRecord row={row} fallback={<SkeletonBodyText lines={4} />}>
          {(full) => (
            <PanelRecord
              row={full}
              addressLabel={addressLabel}
              mapsKey={mapsKey}
              advanced={advanced}
              onAdvanced={() => setAdvanced((v) => !v)}
            />
          )}
        </WithRecord>
      </BlockStack>
    </Box>
  );
}

/** The open row's record part: the order's activity, then the record
 *  (Codex's Advanced, whole). Drawn once the row's record side is here. */
function PanelRecord({
  row,
  addressLabel,
  mapsKey,
  advanced,
  onAdvanced,
}: {
  row: InkRecentOrderRow;
  addressLabel: string;
  mapsKey: string | null;
  advanced: boolean;
  onAdvanced: () => void;
}) {
  const d = row.detail;
  const openCount = opensOf(row.record);
  return (
    <>
        {row.timeline ? (
          <Box padding="400" borderWidth="025" borderColor="border" borderRadius="200">
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
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
          <Box borderWidth="025" borderColor="border" borderRadius="200">
            <Box background="bg-surface-secondary" paddingInline="400" paddingBlock="300" borderRadius="200">
              <InlineStack align="space-between" blockAlign="center">
                <Button
                  variant="plain"
                  textAlign="left"
                  disclosure={advanced ? "up" : "down"}
                  ariaExpanded={advanced}
                  ariaControls={`advanced-${d?.id || row.id}`}
                  onClick={onAdvanced}
                >
                  Advanced
                </Button>
                <Text as="span" tone="subdued">
                  {opensLine(openCount)}
                </Text>
              </InlineStack>
            </Box>
            <Collapsible id={`advanced-${d?.id || row.id}`} open={advanced}>
              {advanced && (
                <Box padding="400">
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
                </Box>
              )}
            </Collapsible>
          </Box>
        )}
    </>
  );
}

export default function InkRecentOrders({
  orders,
  defaultExpandedId = null,
  searching = false,
  mapsKey = null,
  sort,
  onSort,
  pending = false,
  renderPanel,
}: {
  orders: InkOrderRow[];
  returnTo?: string;
  defaultExpandedId?: string | null;
  searching?: boolean;
  /** The Maps JavaScript browser key (GOOGLE_MAPS_BROWSER_KEY); none → no map, the words remain. */
  mapsKey?: string | null;
  /** The list's sort, for the headings; with onSort a heading press re-sorts (the Ritualist's). */
  sort?: InkOrderSort;
  onSort?: (sort: InkOrderSort) => void;
  /** A search, sort or page is loading: the ledger dims until it lands. */
  pending?: boolean;
  /** An opened order, drawn in place of the bare panel: the Ritualist's row
   *  (components/OrderExpandedRow.tsx) is this same panel with its "View full
   *  record" at the foot, as the web app's rows end on "View full order". ink
   *  has no such page and passes none. The row may still be streaming. */
  renderPanel?: (row: InkOrderRow) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpandedId);
  const [hovered, setHovered] = useState<string | null>(null);
  // The headings belong to the desktop ledger; the phone's stacked rows carry
  // no columns to name (the Ritualist's phone). The server draws the desktop.
  const { mdUp } = useBreakpoints({ defaults: { mdUp: true } });
  if (!orders.length)
    return (
      <Box paddingBlock="1600" paddingInline="400">
        <Text as="p" alignment="center" tone="subdued">
          {searching
            ? "No orders match this search. Try another order number, name or email, or clear the search."
            : "No orders are available from the past 60 days."}
        </Text>
      </Box>
    );
  return (
    <Box opacity={pending ? "0.5" : undefined}>
      {mdUp && (
        <>
          <Divider />
          <LedgerHeadings sort={sort} onSort={onSort} />
        </>
      )}
      {orders.map((row) => {
        const open = expanded === row.id;
        const toggle = () => setExpanded(open ? null : row.id);
        return (
          <div
            key={row.id}
            style={open ? { boxShadow: `inset 3px 0 0 ${INK_DATA}` } : undefined}
          >
            <Divider />
            <div
              onClick={(event) => {
                if (pressedTheRow(event)) toggle();
              }}
              onMouseEnter={() => setHovered(row.id)}
              onMouseLeave={() => setHovered((id) => (id === row.id ? null : id))}
              style={open ? { background: INK_DATA_TINT } : undefined}
            >
              <Box
                paddingInline="300"
                paddingBlock={{ xs: "300", md: "200" }}
                background={!open && hovered === row.id ? "bg-surface-hover" : undefined}
              >
                <OrderRow row={row} open={open} onToggle={toggle} />
              </Box>
            </div>
            <Collapsible id={`order-${row.id}`} open={open}>
              {open && (
                <>
                  <Divider />
                  {renderPanel ? renderPanel(row) : <OrderPanel row={row} mapsKey={mapsKey} />}
                </>
              )}
            </Collapsible>
          </div>
        );
      })}
    </Box>
  );
}
