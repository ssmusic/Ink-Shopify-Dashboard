import { useRevalidator } from "react-router";
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
import InkPillNav from "./InkPillNav";
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
      }[]
    | null;
};
export default function InkSettingsView({ data }: { data: SettingsData }) {
  const revalidator = useRevalidator();
  return (
    <Page
      title="Settings"
      backAction={{ content: "Dashboard", url: "/app/ink?view=insights" }}
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
                      <Text as="p">
                        These requests are awaiting completion. Contact support
                        to arrange the response.
                      </Text>
                      {data.privacy.map((r) => (
                        <Text
                          key={r.id}
                          as="p"
                        >{`${r.topic === "customers/data_request" ? "Data request" : "Deletion request"}${r.requestId ? ` ${r.requestId}` : ""}. Due ${new Date(r.dueAt).toLocaleDateString("en-US", { timeZone: "UTC" })}.`}</Text>
                      ))}
                    </>
                  )}
                </BlockStack>
              </Card>
            )}
            <Text as="p">
              <Link url="/app/ink?view=help">Help and support</Link>
            </Text>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
