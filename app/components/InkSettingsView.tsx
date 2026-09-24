import { useEffect, useRef, useState } from "react";
import InkPillNav from "./InkPillNav";
import { useFetcher, useRevalidator } from "react-router";
import {
  BlockStack,
  Button,
  Card,
  InlineStack,
  Layout,
  Link,
  Page,
  Text,
} from "@shopify/polaris";
import InkConnectionCard from "./InkConnectionCard";
import type { InkConnection } from "../services/ink-connection.server";
export type SettingsData = {
  connection?: InkConnection;
  ritualistUrl: string;
  privacy:
    | {
        id: string;
        requestId: string | null;
        topic: string;
        receivedAt: string;
        dueAt: string;
        state?: string;
        downloadedAt?: string | null;
      }[]
    | null;
};

type PrivacyRow = NonNullable<SettingsData["privacy"]>[number];
type ExportResult =
  | { ok: true; download: Record<string, unknown>; filename: string }
  | { ok: false; note: string };

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : "";

// A customers/data_request: the merchant asked Shopify for a customer's
// data; this row hands them what ink holds (routes/app.ink.settings.tsx →
// services/ink-privacy.server.ts exportPrivacyRequest). The file is saved
// the way the record's downloads are (components/InkRecordDoor.tsx).
function DataRequestRow({ row }: { row: PrivacyRow }) {
  const fetcher = useFetcher<ExportResult>();
  const revalidator = useRevalidator();
  const last = useRef<unknown>();
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    const result = fetcher.data;
    if (!result || last.current === result) return;
    last.current = result;
    if (!result.ok) {
      setFailed(result.note);
      return;
    }
    try {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(result.download, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      revalidator.revalidate();
    } catch {
      setFailed("The download could not start. Try again."); // PLACEHOLDER
    }
  }, [fetcher.data, revalidator]);
  const erased = row.state === "response_required_after_redaction";
  return (
    <BlockStack gap="100">
      <InlineStack gap="300" blockAlign="center" wrap>
        {/* PLACEHOLDER words */}
        <Text as="p">{`Data request${row.requestId ? ` ${row.requestId}` : ""}. Received ${day(row.receivedAt)}. Due ${day(row.dueAt)}.`}</Text>
        <Button
          size="slim"
          loading={fetcher.state !== "idle"}
          onClick={() => {
            setFailed(null);
            fetcher.submit({ intent: "privacy_export", id: row.id }, { method: "post", action: "/app/ink/settings" });
          }}
        >
          Download (JSON)
        </Button>
      </InlineStack>
      {row.downloadedAt && (
        <Text as="p" tone="subdued">{`Downloaded ${day(row.downloadedAt)}.`}</Text>
      )}
      {erased && (
        <Text as="p" tone="subdued">
          {/* PLACEHOLDER */}
          This customer was deleted before the data was downloaded. The file says so.
        </Text>
      )}
      {failed && <Text as="p" tone="critical">{failed}</Text>}
    </BlockStack>
  );
}
export default function InkSettingsView({ data }: { data: SettingsData }) {
  const revalidator = useRevalidator();
  return (
    // Every ink page, one width (routes/app.ink.$section.tsx INK_PAGE_WIDTH).
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
    <Page
      fullWidth
      title="Settings"
      secondaryActions={[
        {
          content: "Refresh",
          onAction: () => revalidator.revalidate(),
          loading: revalidator.state !== "idle",
        },
      ]}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <InkPillNav active="settings" />
            <InkConnectionCard connection={data.connection} checking={revalidator.state !== "idle"} onCheck={() => revalidator.revalidate()} />
            {data.ritualistUrl && (
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    The Ritualist
                  </Text>
                  <Text as="p">
                    Branded order pages, delivery notifications and returns.
                  </Text>
                  <InlineStack>
                    <Button url={data.ritualistUrl} external>
                      View The Ritualist
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            )}
            {(data.privacy == null || data.privacy.length > 0) && (
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Customer privacy requests
                  </Text>
                  {data.privacy == null ? (
                    <Text as="p">
                      Requests could not be loaded. Refresh to try again.
                    </Text>
                  ) : (
                    <>
                      {/* PLACEHOLDER words */}
                      <Text as="p">
                        When you request a customer's data in Shopify, the
                        request appears here. Download what ink holds about that
                        customer and send it to them.
                      </Text>
                      {data.privacy.map((r) =>
                        r.topic === "customers/data_request" ? (
                          <DataRequestRow key={r.id} row={r} />
                        ) : (
                          <Text key={r.id} as="p">{`Deletion request${r.requestId ? ` ${r.requestId}` : ""}. In progress. Due ${day(r.dueAt)}.`}</Text>
                        ),
                      )}
                    </>
                  )}
                </BlockStack>
              </Card>
            )}
            <Text as="p">
              <Link url="/app/ink/help">Help and support</Link>
            </Text>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
    </div>
  );
}
