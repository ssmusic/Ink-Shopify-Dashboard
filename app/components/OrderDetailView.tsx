import { useRouteLoaderData } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  InlineStack,
  Badge,
  Divider,
} from "@shopify/polaris";
import type { BadgeProps } from "@shopify/polaris";

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
}

interface OrderDetailViewProps {
  order: Order;
  onBack: () => void;
}

const fmt = (amount: string | number, currency: string) => {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return num.toLocaleString("en-US", { style: "currency", currency });
};

const statusBadgeTone = (s: string): BadgeProps["tone"] => {
  if (s === "verified") return "success";
  if (s === "enrolled") return "warning";
  if (s === "active") return "info";
  return undefined;
};

// The Shopify embed stays lean: order essentials + a handoff. The full delivery
// proof — tap history, location, signed cryptographic record — lives in the
// standalone ink. dashboard (its Advanced drawer), never here. Keeping the crypto
// out of the embed is deliberate (engagement-led surface, not a forensics console).
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

  const statusRaw = order.status?.toLowerCase() || "pending";
  const statusLabel = statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1);
  const deliveredAt = order.metafields.delivery_verified_at || "";

  return (
    <Page
      title={order.orderNumber}
      titleMetadata={<Badge tone={statusBadgeTone(statusRaw)}>{statusLabel}</Badge>}
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
        {/* Left column: Customer + Products */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Customer
                </Text>
                <Text as="p" variant="bodyMd" fontWeight="medium">
                  {order.customerName}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {order.customerEmail || "No email"}
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
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Shipping
                  </Text>
                  <Text as="span" variant="bodySm">
                    Free
                  </Text>
                </InlineStack>
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

        {/* Right column: delivery status + handoff (no forensics in the embed) */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                Delivery
              </Text>
              {deliveredAt ? (
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Delivered
                  </Text>
                  <Text as="span" variant="bodySm">
                    {deliveredAt}
                  </Text>
                </InlineStack>
              ) : (
                <Text as="p" variant="bodySm" tone="subdued">
                  No delivery recorded yet.
                </Text>
              )}
              <Divider />
              <Text as="p" variant="bodySm" tone="subdued">
                The full delivery record — tap history, location, and the signed
                cryptographic proof — lives in your ink. dashboard. Open it from the
                Dashboard.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
