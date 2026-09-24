import { useState } from "react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Collapsible,
  Divider,
  InlineGrid,
  InlineStack,
  Link,
  Pagination,
  Text,
} from "@shopify/polaris";
import InkRecordDoor, { type InkDoor } from "./InkRecordDoor";
import InkRecordInspection from "./InkRecordInspection";
import type { RecordRead } from "../lib/record-words";

export type HistoryItem = {
  proofId: string;
  orderName: string | null;
  createdAt: string | null;
  state: string;
  door: InkDoor | null;
  record: RecordRead | null;
};

function dateLabel(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function RecordHistoryItem({ row, mapsKey }: { row: HistoryItem; mapsKey: string | null }) {
  const [open, setOpen] = useState(false);
  const orderLabel = row.orderName || `Record ${row.proofId.slice(-8)}`;
  const available = row.door?.downloadable === true;
  const status = available
    ? "Available"
    : row.door?.paidPendingRecord
      ? "Access pending"
      : row.door?.resumeUrl
        ? "Approval pending"
        : row.door?.pending
          ? "Charge status unknown"
          : "Unavailable";
  return (
    <Box
      borderWidth="025"
      borderColor="border"
      borderRadius="200"
      overflowX="hidden"
      overflowY="hidden"
    >
      <Box padding="400" background="bg-surface">
        <InlineGrid
          columns={{ xs: 1, md: "1fr 1fr auto" }}
          gap="300"
          alignItems="center"
        >
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              {orderLabel}
            </Text>
            <InlineStack>
              <Badge>{status}</Badge>
            </InlineStack>
          </BlockStack>
          <BlockStack gap="100">
            <Text as="p" variant="bodySm" tone="subdued">
              Added to records
            </Text>
            <Text as="p">{dateLabel(row.createdAt)}</Text>
          </BlockStack>
          {row.door && (available || row.door.pending) ? (
            <InkRecordDoor
              proofId={row.proofId}
              door={{ ...row.door, offerLine: null }}
              compact
              orderLabel={orderLabel}
            />
          ) : (
            <Text as="p" tone="subdued">
              Record access is unavailable. Refresh to check again.
            </Text>
          )}
        </InlineGrid>
      </Box>
      {row.record && available && (
        <>
          <Divider />
          <Box
            paddingInline="400"
            paddingBlock="200"
            background="bg-surface-secondary"
          >
            <Button
              variant="plain"
              textAlign="left"
              disclosure={open ? "up" : "down"}
              accessibilityLabel={`View record details for ${orderLabel}`}
              ariaExpanded={open}
              ariaControls={`record-details-${row.proofId}`}
              onClick={() => setOpen((value) => !value)}
            >
              View record details
            </Button>
          </Box>
          <Collapsible id={`record-details-${row.proofId}`} open={open}>
            {open && (
              <Box padding="400">
                <InkRecordInspection
                  proofId={row.proofId}
                  record={row.record}
                  mapsKey={mapsKey}
                />
              </Box>
            )}
          </Collapsible>
        </>
      )}
    </Box>
  );
}

export default function InkRecordHistory({
  rows,
  error,
  hasNext,
  hasPrevious,
  onNext,
  onPrevious,
  mapsKey = null,
  included = false,
}: {
  rows: HistoryItem[];
  /** The records are included on this store (no price): `rows` are its recent
   *  orders' records, not purchases (routes/app.ink.$section.tsx). */
  included?: boolean;
  error: boolean;
  hasNext: boolean;
  hasPrevious: boolean;
  onNext: () => void;
  onPrevious: () => void;
  /** The Maps JavaScript browser key; none → no map, the words remain. */
  mapsKey?: string | null;
}) {
  const available = rows.filter((row) => row.door?.downloadable);
  const pending = rows.filter((row) => !row.door?.downloadable);
  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            Your record library
          </Text>
          <Text as="p" tone="subdued">
            {included
              ? "Records are included on this store. Download any recent order's record here."
              : "Buy a record from its order. Records purchased in this app stay here for repeat downloads, including older orders."}
          </Text>
          <Text as="p" tone="subdued">
            Choose PDF for the one-page record, or JSON for the signed data.
            Files are not emailed.
          </Text>
        </BlockStack>
      </Card>
      {error ? (
        <Banner tone="critical">
          Record purchases could not be loaded. Refresh to try again.
        </Banner>
      ) : rows.length === 0 ? (
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              {included ? "No records in the past 60 days" : "No purchased records yet"}
            </Text>
            <Text as="p">
              {included
                ? "A record appears here once an order from the past 60 days has one."
                : "Review an order before choosing whether to buy its record downloads."}
            </Text>
            <InlineStack>
              <Button url="/app/ink/orders">View orders</Button>
            </InlineStack>
          </BlockStack>
        </Card>
      ) : (
        <>
          {available.length > 0 && (
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                {included ? "Recent records" : "Purchased records"}
              </Text>
              {available.map((row) => (
                <RecordHistoryItem key={row.proofId} row={row} mapsKey={mapsKey} />
              ))}
            </BlockStack>
          )}
          {pending.length > 0 && (
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Needs attention
              </Text>
              {pending.map((row) => (
                <RecordHistoryItem key={row.proofId} row={row} mapsKey={mapsKey} />
              ))}
            </BlockStack>
          )}
        </>
      )}
      {(hasNext || hasPrevious) && (
        <InlineStack align="center">
          <Pagination
            hasPrevious={hasPrevious}
            hasNext={hasNext}
            onPrevious={onPrevious}
            onNext={onNext}
            previousTooltip="Newer purchases"
            nextTooltip="Older purchases"
          />
        </InlineStack>
      )}
      <Text as="p" variant="bodySm" tone="subdued">
        Downloads remain available while this app and record access are active.
        {included ? " If a record is missing," : " If a past purchase is missing,"}{" "}
        <Link url="mailto:info@in.ink">contact support</Link>.
      </Text>
    </BlockStack>
  );
}
