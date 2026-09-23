import { useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { BlockStack, Button, InlineStack, Link, Text } from "@shopify/polaris";
import type { action } from "../routes/app.record";

export type InkDoor = {
  offerLine: string | null;
  pending?: boolean;
  resumeUrl?: string | null;
  downloadable?: boolean;
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
            Check payment status
          </Button>
        )}
      </InlineStack>
      {door.downloadable && (
        <Text as="p" tone="subdued" variant="bodySm">
          JSON file with the signed events and customer information.
        </Text>
      )}
      {door.offerLine && (
        <Text as="p" tone="subdued" variant="bodySm">
          One-time charge through Shopify. Includes a JSON download of the
          record.
        </Text>
      )}
      {door.pending && (
        <Text as="p">
          Payment is pending. If this continues,{" "}
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
