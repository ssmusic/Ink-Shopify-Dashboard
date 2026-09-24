import { useRouteLoaderData } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  InlineStack,
  Divider,
} from "@shopify/polaris";
import { LifecycleRail } from "./OrderTimeline";
import type { InkRecentOrderRow } from "./InkRecentOrders";

interface OrderItem {
  title: string;
  quantity: number;
  price: string;
  sku: string;
}

interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerAddress?: {
    address1: string;
    city: string;
    provinceCode: string;
    zip: string;
  };
  date: string;
  total: string;
  subtotal: string;
  currency: string;
  status: string;
  items: OrderItem[];
  metafields: {
    nfc_uid?: string;
    proof_reference?: string;
    warehouse_gps?: string;
    verification_status?: string;
    delivery_verified_at?: string;
    delivery_gps?: string;
    device_info?: string;
    [key: string]: any;
  };
  /** The row ink's panel reads (routes/app.tagged-shipments._index.tsx): its
   *  timeline carries the order's steps, each with where its time came from. */
  row?: InkRecentOrderRow;
}

interface OrderDetailViewProps {
  order: Order;
  onBack: () => void;
}

const fmt = (amount: string | number, currency: string) => {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return num.toLocaleString("en-US", { style: "currency", currency });
};

// THE ORDER'S FULL-PAGE VIEW — what "View full record" opens from a Shipments
// row: the recipient, the products, the order's activity on the honest rail,
// the way to the order in Shopify, and the handoff to the studio, where the
// brand book, the pages and the campaigns live. The record itself — its
// files, its words, the opens on their maps — is in the row (ink's panel).
//
// The recipient is the ship-to's own name and the order's own email, as the
// Shipments ledger reads them (services/ink-links.server.ts). The title
// carries no status badge: that list never reads the ink status word, so the
// badge would have said "Pending" of every order; the rail says the order's
// state, each step with where its time came from. (The door notification's
// badge was a green "Verified" until Sam, 2026-09-24: "wrong".)
export default function OrderDetailView({ order, onBack }: OrderDetailViewProps) {
  // Shop slug for the "View in Shopify" link.
  const settingsData = useRouteLoaderData("routes/app.settings") as any;
  const shopUrlSlug = (() => {
    if (settingsData?.shopDomain) {
      return settingsData.shopDomain.replace(".myshopify.com", "");
    }
    try {
      const params = new URLSearchParams(window.location.search);
      const shopParam = params.get("shop") || "";
      return shopParam.replace(".myshopify.com", "") || "admin";
    } catch {
      return "admin";
    }
  })();

  return (
    <Page
      title={order.orderNumber}
      subtitle={order.date}
      backAction={{ content: "Shipments", onAction: onBack }}
      secondaryActions={[
        {
          content: "View in Shopify",
          external: true,
          url: `https://admin.shopify.com/store/${shopUrlSlug}/orders/${order.id}`,
        },
      ]}
    >
      <Layout>
        {/* Left column: Recipient + Products — ink's words for them
            (components/InkRecentOrders.tsx). */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Recipient
                </Text>
                <Text as="p" variant="bodyMd" fontWeight="medium">
                  {order.customerName}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {`Order email: ${order.customerEmail || "Unavailable"}`}
                </Text>
                {order.customerAddress && (
                  <>
                    <Divider />
                    <Text as="p" variant="bodySm" tone="subdued">
                      {order.customerAddress.address1}
                      <br />
                      {order.customerAddress.city}, {order.customerAddress.provinceCode}{" "}
                      {order.customerAddress.zip}
                    </Text>
                  </>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Products
                </Text>
                {order.items.map((item, idx) => (
                  <InlineStack key={idx} align="space-between" blockAlign="start">
                    <BlockStack gap="0">
                      <Text as="p" variant="bodySm" fontWeight="medium">
                        {item.title}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {item.sku ? `${item.sku} × ` : ""}
                        {item.quantity}
                      </Text>
                    </BlockStack>
                    <Text as="p" variant="bodySm" fontWeight="medium">
                      {fmt(parseFloat(item.price) * item.quantity, order.currency)}
                    </Text>
                  </InlineStack>
                ))}
                <Divider />
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Subtotal
                  </Text>
                  <Text as="span" variant="bodySm">
                    {fmt(order.subtotal, order.currency)}
                  </Text>
                </InlineStack>
                {/* No "Shipping — Free": it printed on every order, whatever the
                    order paid — the line App Store review flagged on ink
                    (2026-09-23), gone from the row since; the total is the
                    order's own. */}
                <Divider />
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm" fontWeight="semibold">
                    Total
                  </Text>
                  <Text as="span" variant="bodySm" fontWeight="semibold">
                    {fmt(order.total, order.currency)}
                  </Text>
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        {/* Right column: the order's activity + the handoff to the studio.
            The activity is ink's honest rail (components/OrderTimeline.tsx):
            each step says where its time came from, and only ink's own record
            and a carrier's scan get a tick. It replaces a bare "Delivered"
            time read off the order's metafield, which never said who reported
            it. The words are ink's (components/InkRecentOrders.tsx). */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                Order activity
              </Text>
              {order.row?.timeline ? (
                <LifecycleRail steps={order.row.timeline.steps} />
              ) : (
                <Text as="p" variant="bodySm" tone="subdued">
                  {order.row?.proofId
                    ? "Order activity is unavailable. Refresh to try again."
                    : "No record is linked to this order."}
                </Text>
              )}
              <Divider />
              <Text as="p" variant="bodySm" tone="subdued">
                The full delivery record — open history, location, and the signed
                record — lives in your Ritualist studio. Open it from the Dashboard.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
