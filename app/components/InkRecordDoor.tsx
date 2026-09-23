import { useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { BlockStack, Button, InlineStack, Link, Text } from "@shopify/polaris";
import type { action } from "../routes/app.record";

export type InkDoor = {
  offerLine: string | null;
  pending?: boolean;
  paidPendingRecord?: boolean;
  resumeUrl?: string | null;
  downloadable?: boolean;
  inHistory?: boolean;
  purchase?: unknown;
};
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
}: {
  proofId: string;
  door: InkDoor;
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
  return (
    <BlockStack gap="200">
      {door.offerLine && (
        <Text as="p" variant="bodySm">
          The record adds the event history behind this order: timestamps, event
          IDs, hashes, signatures, and any location shared with an open. Pay
          once through Shopify to download a PDF, CSV, and the signed JSON file
          here or later in Records. The files can include customer details. Ink
          does not email them.
        </Text>
      )}
      <InlineStack gap="300">
        {door.downloadable && (
          <>
            <Button
              loading={fetcher.state !== "idle"}
              onClick={() => submit("pdf")}
            >
              Download PDF
            </Button>
            <Button
              loading={fetcher.state !== "idle"}
              onClick={() => submit("csv")}
            >
              Download CSV
            </Button>
            <Button
              loading={fetcher.state !== "idle"}
              onClick={() => submit("download")}
            >
              Download record (JSON)
            </Button>
          </>
        )}
        {door.offerLine && (
          <Button
            variant="primary"
            loading={fetcher.state !== "idle"}
            onClick={() => submit("buy")}
          >
            {door.offerLine}
          </Button>
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
      {door.downloadable && (
        <Text as="p" tone="subdued" variant="bodySm">
          The PDF is a readable copy. The CSV organizes the evidence and event
          details. The JSON file contains the signed manifest, evidence packet,
          complete event chain, receipt, and order summary. The files can
          include customer information.{" "}
          {door.inHistory
            ? "You can download them again from Records."
            : "You can download them again from this order while it remains in the recent-order list."}{" "}
          Ink does not email them.
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
