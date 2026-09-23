import { useEffect, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  ChoiceList,
  InlineStack,
  Layout,
  Link,
  Page,
  Text,
} from "@shopify/polaris";
import type { action } from "../routes/app.ink.settings";
import type { FlashForward } from "../services/ink-merchant.server";
import InkPillNav from "./InkPillNav";
export type SettingsData = {
  flashForward: FlashForward | null;
  canSave: boolean;
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
  const fetcher = useFetcher<typeof action>();
  const [choice, setChoice] = useState<FlashForward | null>(data.flashForward);
  useEffect(() => setChoice(data.flashForward), [data.flashForward]);
  const saving = fetcher.state !== "idle";
  return (
    <Page
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
            {fetcher.data?.error && (
              <Banner tone="critical">{fetcher.data.error}</Banner>
            )}
            {fetcher.data?.ok && (
              <Banner tone="info">Destination saved.</Banner>
            )}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Tracking link destination
                </Text>
                <Text as="p">
                  After opening the tracking link, customers continue to this
                  page. The browser may first ask them to share their location.
                </Text>
                {data.canSave ? (
                  <fetcher.Form method="post">
                    <BlockStack gap="300">
                      <ChoiceList
                        title="Send customers to"
                        name="flash_forward"
                        choices={[
                          {
                            label: "Shopify order page",
                            value: "order_status",
                            helpText:
                              "Order details and tracking. Shopify may ask the customer to sign in.",
                          },
                          {
                            label: "Carrier tracking page",
                            value: "carrier",
                            helpText: "Tracking details from the carrier.",
                          },
                        ]}
                        selected={choice ? [choice] : []}
                        onChange={(values) =>
                          setChoice(values[0] as FlashForward)
                        }
                      />
                      <Text as="p" tone="subdued">
                        {data.flashForward
                          ? "The selected destination was last saved in this app."
                          : "No destination has been saved in this app. The current setting is unavailable."}
                      </Text>
                      <Text as="p" tone="subdued">
                        If that page is unavailable, the link may use another
                        destination. Stores using The Ritualist may show their
                        branded page instead.
                      </Text>
                      <InlineStack>
                        <Button submit variant="primary" loading={saving}>
                          Save destination
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </fetcher.Form>
                ) : (
                  <Text as="p" tone="subdued">
                    Store setup is incomplete. Refresh to try again.
                  </Text>
                )}
              </BlockStack>
            </Card>
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
              <Link url="mailto:info@in.ink">Contact support</Link>
            </Text>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
