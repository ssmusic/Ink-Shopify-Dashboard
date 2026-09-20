import { useState } from "react";
import { BlockStack, Button, Card, InlineStack, Text } from "@shopify/polaris";

// VERIFIABLE RECORD — where a merchant already stands, on the order: the
// public link a stranger can open to re-check the order's signed record in
// their own browser, the QR of it, the printed audit report, and the export
// bundle (the audit machine; Into Health's "Verifiable proof" card, mapped
// visit → order). Every string here derives from what the loader resolved;
// with no signed record on file the card says so and offers nothing.
export type VerifiableRecordCardProps = {
  proofId: string;
  verifyUrl: string;
  qrSrc: string;
  auditReportHref: string;
  recordExportHref: string;
  /** Whether ink has published a chained record for this order yet. */
  published: boolean;
};

export default function VerifiableRecordCard({ verifyUrl, qrSrc, auditReportHref, recordExportHref, published }: VerifiableRecordCardProps) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(verifyUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">Verifiable record</Text>
        {published ? (
          <>
            <InlineStack gap="400" blockAlign="start" wrap={false}>
              <img src={qrSrc} alt="Re-check this record" width={112} height={112} style={{ border: "1px solid var(--p-color-border)", background: "#fff" }} />
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  Anyone can scan this or open the link and re-check the order&apos;s signed record in their own browser — every signature verifies against ink&apos;s published key. The buyer&apos;s location is sealed there; only your copies carry it.
                </Text>
                <Text as="p" variant="bodySm" breakWord><code style={{ fontFamily: "monospace", fontSize: "12px" }}>{verifyUrl}</code></Text>
                <InlineStack gap="200">
                  <Button size="slim" onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
                  <Button size="slim" url={verifyUrl} external>Open</Button>
                </InlineStack>
              </BlockStack>
            </InlineStack>
            <InlineStack gap="200">
              <Button url={auditReportHref} download>Audit report (PDF)</Button>
              <Button url={recordExportHref} download variant="tertiary">Export the record</Button>
            </InlineStack>
          </>
        ) : (
          <Text as="p" variant="bodySm" tone="subdued">Verification not yet published for this order.</Text>
        )}
      </BlockStack>
    </Card>
  );
}
