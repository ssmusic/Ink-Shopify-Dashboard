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
  if (!value) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function RecordHistoryItem({ row }: { row: HistoryItem }) {
  const [open, setOpen] = useState(false);
  const status = row.door?.downloadable
    ? "Available"
    : row.door?.paidPendingRecord
      ? "Access pending"
      : row.door?.resumeUrl
        ? "Approval pending"
        : row.door?.pending
          ? "Charge status unknown"
          : "Unavailable";
  return (
    <BlockStack gap="300">
      <InlineStack align="space-between" gap="200">
        <Text as="h3" variant="headingSm">
          {row.orderName || `Record ${row.proofId.slice(-8)}`}
        </Text>
        <Text as="span" tone="subdued">
          {dateLabel(row.createdAt)}
        </Text>
      </InlineStack>
      <InlineStack>
        <Badge tone="info">{status}</Badge>
      </InlineStack>
      {row.door ? (
        row.door.downloadable || row.door.pending ? (
          <InkRecordDoor proofId={row.proofId} door={row.door} />
        ) : (
          <Text as="p" tone="subdued">
            Record access is unavailable. Refresh to check again or contact
            support.
          </Text>
        )
      ) : (
        <Text as="p" tone="subdued">
          Record status is unavailable. Refresh to try again.
        </Text>
      )}
      {row.record && row.door?.downloadable && (
        <BlockStack gap="300">
          <Button
            variant="plain"
            textAlign="left"
            disclosure={open ? "up" : "down"}
            ariaExpanded={open}
            ariaControls={`record-details-${row.proofId}`}
            onClick={() => setOpen((value) => !value)}
          >
            View record details
          </Button>
          <Collapsible id={`record-details-${row.proofId}`} open={open}>
            <BlockStack gap="400">
              {open && (
                <InkRecordInspection
                  proofId={row.proofId}
                  record={row.record}
                />
              )}
            </BlockStack>
          </Collapsible>
        </BlockStack>
      )}
    </BlockStack>
  );
}

export default function InkRecordHistory({
  rows,
  error,
  hasNext,
  hasPrevious,
  onNext,
  onPrevious,
}: {
  rows: HistoryItem[];
  error: boolean;
  hasNext: boolean;
  hasPrevious: boolean;
  onNext: () => void;
  onPrevious: () => void;
}) {
  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            Records and approvals
          </Text>
          <Text as="p" tone="subdued">
            Purchased records and approvals started in the app appear here,
            including orders outside Shopify’s recent-order list. Download the
            PDF, CSV, or JSON file again while this app and record access remain
            available. Ink does not email the files. If a past purchase is
            missing, <Link url="mailto:info@in.ink">contact support</Link>.
          </Text>
        </BlockStack>
        {error ? (
          <Banner tone="critical">
            Record purchases could not be loaded. Refresh to try again.
          </Banner>
        ) : rows.length === 0 ? (
          <Text as="p" tone="subdued">
            No record purchases or approvals saved by this app yet. Open an
            order to review its activity and available record.
          </Text>
        ) : (
          rows.map((row, index) => (
            <BlockStack key={row.proofId} gap="300">
              {index > 0 && <Divider />}
              <RecordHistoryItem row={row} />
            </BlockStack>
          ))
        )}
        {(hasNext || hasPrevious) && (
          <Box>
            <Pagination
              hasPrevious={hasPrevious}
              hasNext={hasNext}
              onPrevious={onPrevious}
              onNext={onNext}
              previousTooltip="Newer purchases"
              nextTooltip="Older purchases"
            />
          </Box>
        )}
      </BlockStack>
    </Card>
  );
}
