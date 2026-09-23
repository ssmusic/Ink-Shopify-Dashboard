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
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(result.download, null, 2)], {
            type: "application/json",
          }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = result.filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
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
      <InlineStack gap="300">
        {door.downloadable && (
          <Button
            loading={fetcher.state !== "idle"}
            onClick={() => submit("download")}
          >
            Download record
          </Button>
        )}
        {door.offerLine && (
          <Button
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
          Downloads a JSON file with a signed manifest, evidence packet, event chain, receipt, and order summary. It can include customer information. {door.inHistory ? "You can download it again from Records." : "You can download it again from this order while it remains in the recent-order list."} Ink does not email the file.
        </Text>
      )}
      {door.offerLine && (
        <Text as="p" tone="subdued" variant="bodySm">
          One-time charge through Shopify. After approval, download the JSON file here or from Records. It contains a signed manifest, evidence packet, event chain, receipt, and order summary, which can include customer information. Ink does not email the file.
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
