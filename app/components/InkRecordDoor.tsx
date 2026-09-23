// INK'S RECORD DOOR — at the top of an order's Advanced section.
//
// THE $29 BUYS THE HAND-OVER (Sam, 2026-09-23: "the 29 gets it signed" · "they
// need to see all the info but not get the signed hash"; lib/record-handover.ts):
// the merchant already sees the whole record, so the door sells the signed
// copy to hand over — the PDF, the CSV and the signed JSON. "Get the record"
// carries no price beside it (Sam, 2026-09-23: "loose the price next to the
// get the record button"); Shopify's approval screen states it. The charge is
// reserved before that screen and bound to this shop and record
// (services/ink-billing.server.ts). Once bought: the files, "Did you win?" —
// the merchant's word, recorded from day one and never scored — and, beside
// this door, the record's texts for Shopify's dispute form.
//
// Every visible string is PLACEHOLDER copy — Sam's words replace it.
import { useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { BlockStack, Button, InlineStack, Link, Select, Text } from "@shopify/polaris";
import type { action } from "../routes/app.record";
import { HANDOVER_SENTENCE } from "../lib/record-handover";

export type InkPurchase = { id: string; packet_url: string | null; outcome: "open" | "won" | "lost" | "unknown" };

export type InkDoor = {
  offerLine: string | null;
  pending?: boolean;
  paidPendingRecord?: boolean;
  resumeUrl?: string | null;
  downloadable?: boolean;
  inHistory?: boolean;
  /** The backend's purchase of this record, once bought (its outcome is the merchant's word). */
  purchase?: InkPurchase | null;
};

// PLACEHOLDER labels.
const OUTCOME_OPTIONS = [
  { label: "Still open", value: "open" },
  { label: "Won", value: "won" },
  { label: "Lost", value: "lost" },
  { label: "Don't know", value: "unknown" },
];

/** "Did you win?" — the merchant's word on a bought record's dispute. */
function DidYouWin({ purchase }: { purchase: InkPurchase }) {
  const outcome = useFetcher<typeof action>();
  const current = (outcome.formData?.get("outcome") as string | null) ?? purchase.outcome;
  return (
    <Select
      label="Did you win?"
      labelInline
      options={OUTCOME_OPTIONS}
      value={current}
      disabled={outcome.state !== "idle"}
      onChange={(value) =>
        outcome.submit(
          { intent: "outcome", purchase_id: purchase.id, outcome: value },
          { method: "post", action: "/app/record" },
        )
      }
    />
  );
}
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function InkRecordDoor({
  proofId,
  door,
  compact = false,
  orderLabel,
}: {
  proofId: string;
  door: InkDoor;
  compact?: boolean;
  orderLabel?: string;
}) {
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const last = useRef<unknown>();
  const [downloadError, setDownloadError] = useState(false);
  useEffect(() => {
    const result = fetcher.data;
    if (!result || last.current === result) return;
    last.current = result;
    if (result.confirmationUrl) window.open(result.confirmationUrl, "_top");
    if ("download" in result && result.download && result.filename) {
      try {
        saveBlob(
          new Blob([JSON.stringify(result.download, null, 2)], {
            type: "application/json",
          }),
          result.filename,
        );
      } catch {
        setDownloadError(true);
      }
    }
    if ("csvText" in result && result.csvText && result.filename) {
      try {
        saveBlob(
          new Blob([result.csvText], { type: "text/csv;charset=utf-8" }),
          result.filename,
        );
      } catch {
        setDownloadError(true);
      }
    }
    if ("pdfBase64" in result && result.pdfBase64 && result.filename) {
      try {
        const bytes = Uint8Array.from(atob(result.pdfBase64), (char) =>
          char.charCodeAt(0),
        );
        saveBlob(
          new Blob([bytes], { type: "application/pdf" }),
          result.filename,
        );
      } catch {
        setDownloadError(true);
      }
    }
  }, [fetcher.data]);
  const submit = (intent: string) => {
    setDownloadError(false);
    fetcher.submit(
      { intent, proof_id: proofId },
      { method: "post", action: "/app/record" },
    );
  };
  if (!door.offerLine && !door.downloadable && !door.pending && !door.purchase) {
    return (
      <Text as="p" tone="subdued">
        Record access is unavailable. Refresh to check again.
      </Text>
    );
  }
  return (
    <BlockStack gap="200">
      <InlineStack align="space-between" gap="300" blockAlign="center">
        {!compact && (
          <BlockStack gap="100">
            <Text as="h3" variant="headingSm">
              {door.downloadable ? "Export the record" : "Record downloads"}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {door.offerLine
                ? "PDF report, CSV data and signed JSON. Includes the events available for this order."
                : "PDF report, CSV data and signed JSON file."}
            </Text>
          </BlockStack>
        )}
        <InlineStack gap="200">
          {door.downloadable && (
            <>
              <Button
                loading={fetcher.state !== "idle"}
                accessibilityLabel={
                  orderLabel ? `Download PDF for ${orderLabel}` : undefined
                }
                onClick={() => submit("pdf")}
              >
                {compact ? "PDF" : "Download PDF"}
              </Button>
              <Button
                loading={fetcher.state !== "idle"}
                accessibilityLabel={
                  orderLabel ? `Download CSV for ${orderLabel}` : undefined
                }
                onClick={() => submit("csv")}
              >
                {compact ? "CSV" : "Download CSV"}
              </Button>
              <Button
                loading={fetcher.state !== "idle"}
                accessibilityLabel={
                  orderLabel ? `Download JSON for ${orderLabel}` : undefined
                }
                onClick={() => submit("download")}
              >
                {compact ? "JSON" : "Download record (JSON)"}
              </Button>
            </>
          )}
          {door.offerLine && (
            <Button
              variant="primary"
              loading={fetcher.state !== "idle"}
              onClick={() => submit("buy")}
            >
              Get the record
            </Button>
          )}
          {door.offerLine && (
            <Text as="span" variant="bodySm" tone="subdued">
              {HANDOVER_SENTENCE}
            </Text>
          )}
          {door.pending && door.resumeUrl && (
            <Button onClick={() => window.open(door.resumeUrl!, "_top")}>
              Continue Shopify approval
            </Button>
          )}
          {door.pending && (
            <Button
              loading={revalidator.state !== "idle"}
              onClick={() => revalidator.revalidate()}
            >
              {door.paidPendingRecord
                ? "Check record access"
                : "Check payment status"}
            </Button>
          )}
        </InlineStack>
      </InlineStack>
      {door.offerLine && (
        <Text as="p" variant="bodySm" tone="subdued">
          One-time Shopify charge. Download here or again in Records. No email
          is sent.
        </Text>
      )}
      {door.downloadable && !compact && (
        <Text as="p" tone="subdued" variant="bodySm">
          Files can include customer details.{" "}
          {door.inHistory
            ? "You can download them again from Records."
            : "You can download them again from this order while it remains in the recent-order list."}{" "}
          No email is sent.
        </Text>
      )}
      {door.pending && (
        <Text as="p">
          {door.paidPendingRecord
            ? "Shopify approved the charge, but the record is not available yet. Check status or "
            : door.resumeUrl
              ? "Shopify approval has not completed. Continue approval or check status. If you need help, "
              : "The charge status could not be confirmed. Check status or "}
          <Link url="mailto:info@in.ink">contact support</Link>.
        </Text>
      )}
      {door.purchase && !compact ? (
        <InlineStack>
          <DidYouWin purchase={door.purchase} />
        </InlineStack>
      ) : null}
      {fetcher.data && !fetcher.data.ok && fetcher.data.note && (
        <Text as="p" tone="critical">
          {fetcher.data.note}
        </Text>
      )}
      {downloadError && (
        <Text as="p" tone="critical">
          The download could not start. Try again.
        </Text>
      )}
    </BlockStack>
  );
}
