import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import {
  Page, Layout, Card, BlockStack, InlineStack, Text, Button, Badge, DataTable, Banner,
} from "@shopify/polaris";
import type { BadgeProps } from "@shopify/polaris";
import OnboardingChecklist from "../OnboardingChecklist";
import TrackingLinkSettings from "../TrackingLinkSettings";
import CommunicationSettings from "../settings/CommunicationSettings";
import RitualistDoor from "./RitualistDoor";
import type { EnrolledOrders } from "../../services/enrolled-orders.server";

// THE EMBED IS A DOOR. This is the whole app inside Shopify: open the
// Ritualist, see that the store is connected and enrolling, and flip the few
// switches that have to live in Shopify because they change Shopify — the
// tracking link, the order status page, the line in Shopify's own emails, and
// the delivery emails sent in the brand's name. Everything else — brand,
// pages, campaigns, returns, insights — lives in the studio the button opens.
//
// Copy on this page is reused from the surfaces it replaced; the only new
// words are the button label, which is Sam's ("Open The Ritualist").

export type HomeData = {
  shopDomain: string;
  shopName: string;
  contactEmail: string;
  installedDate: string;
  connected: boolean;
  /** The backend's return_enabled for this store. Off for every pilot. */
  returnsOn: boolean;
} & EnrolledOrders;

type DoorResult = { url: string | null; error: string | null };

// The Shipments page's own badge words, unchanged. "Verified" is set when the
// buyer opens their page (the backend's verify → /ink/update).
const STATUS: Record<string, { tone: BadgeProps["tone"]; label: string }> = {
  enrolled: { tone: "warning", label: "Enrolled" },
  cooldown: { tone: "info", label: "Enrolled" },
  active: { tone: "info", label: "Enrolled" },
  verified: { tone: "success", label: "Verified" },
  expired: { tone: undefined, label: "Expired" },
};

const HomePage = (data: HomeData) => {
  const fetcher = useFetcher<DoorResult>();
  const pendingWindow = useRef<Window | null>(null);
  const opening = fetcher.state !== "idle";

  const openRitualist = () => {
    // Open the tab synchronously inside the click (a user gesture) so the
    // browser doesn't block it, then point it at the signed-in URL.
    pendingWindow.current = window.open("", "_blank");
    fetcher.submit({}, { method: "post" });
  };

  useEffect(() => {
    const result = fetcher.data;
    if (!result) return;
    if (result.url) {
      if (pendingWindow.current) pendingWindow.current.location.href = result.url;
      else window.open(result.url, "_blank", "noopener,noreferrer");
      pendingWindow.current = null;
    } else if (result.error && pendingWindow.current) {
      pendingWindow.current.close();
      pendingWindow.current = null;
    }
  }, [fetcher.data]);

  const recent = data.orders.slice(0, 5);
  const rows = recent.map((o) => {
    const badge = STATUS[o.status] || { tone: undefined, label: o.status };
    return [
      <Text as="span" fontWeight="semibold" key={`${o.id}-n`}>{o.orderNumber}</Text>,
      o.customerName,
      o.date,
      `${o.currency === "USD" ? "$" : ""}${Number(o.total).toLocaleString("en-US", { minimumFractionDigits: 2 })}${o.currency === "USD" ? "" : ` ${o.currency}`}`,
      <Badge tone={badge.tone} key={`${o.id}-s`}>{badge.label}</Badge>,
    ];
  });

  return (
    <Page>
      <BlockStack gap="500">
        {fetcher.data?.error ? <Banner tone="critical">{fetcher.data.error}</Banner> : null}

        <RitualistDoor shopDomain={data.shopDomain} onOpen={openRitualist} opening={opening} />

        <OnboardingChecklist onOpenStudio={openRitualist} studioOpening={opening} />

        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Connected store</Text>
                <Text as="p" fontWeight="semibold">{data.shopDomain}</Text>
                {data.contactEmail ? (
                  <Text as="p" tone="subdued">Contact: {data.contactEmail}</Text>
                ) : null}
                <Text as="p" tone="subdued">
                  {data.counts.all} order{data.counts.all === 1 ? "" : "s"} enrolled
                  {data.counts.verified > 0 ? ` · ${data.counts.verified} verified` : ""}
                </Text>
                {data.installedDate ? (
                  <Text as="p" tone="subdued">Installed {data.installedDate}</Text>
                ) : null}
                {!data.connected ? (
                  <Badge tone="attention">Connecting…</Badge>
                ) : null}
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section>
            <div id="orders">
              <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Shipments</Text>
              {data.error ? (
                <Text as="p" tone="subdued">{data.error}</Text>
              ) : recent.length === 0 ? (
                <Text as="p" tone="subdued">
                  New orders enroll automatically. Place a test order, or wait for your next real one.
                </Text>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "numeric", "text"]}
                  headings={["Order", "Customer", "Date", "Total", "Status"]}
                  rows={rows}
                  increasedTableDensity
                />
              )}
            </BlockStack>
              </Card>
            </div>
          </Layout.Section>
        </Layout>

        <Layout>
          <TrackingLinkSettings />
        </Layout>

        <div id="notifications">
          <CommunicationSettings shopDomain={data.shopDomain} returnsOn={data.returnsOn} />
        </div>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Cost</Text>
            {/* Sam's words, 2026-09-03 — he rejected "Your Shopify plan is Free"
                (it reads as the merchant's own Shopify subscription). */}
            <Text as="p" fontWeight="semibold">We are free for now.</Text>
            <Text as="p" tone="subdued">
              There is no subscription charge, trial, usage fee, or off-platform invoice. Installing
              the app creates no charge. If paid plans are introduced later, you’ll choose and approve
              one inside Shopify — nothing will start on its own.
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
};

export default HomePage;
