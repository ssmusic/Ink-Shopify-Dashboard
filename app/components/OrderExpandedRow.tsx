import { BlockStack, Box, Button, InlineStack, Text } from "@shopify/polaris";
import { ExternalIcon } from "@shopify/polaris-icons";

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
    gps_verdict?: string;
    verify_url?: string;
    [key: string]: any;
  };
}

interface OrderExpandedRowProps {
  order: Order;
  onCollapse: () => void;
  onViewFull: () => void;
}

const fmt = (amount: string | number, currency: string) => {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return num.toLocaleString("en-US", { style: "currency", currency });
};

const formatTimestamp = (raw: string): string => {
  if (!raw) return raw;
  try {
    return new Date(raw).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return raw;
  }
};

// The orders-table row expansion stays lean: customer + products + delivery, and a
// handoff. The full delivery proof — tap history, location, signed cryptographic
// record — lives in the standalone ink. dashboard, never in the embed. Keeping the
// crypto/forensics out of the embed is deliberate.
const OrderExpandedRow = ({ order, onCollapse, onViewFull }: OrderExpandedRowProps) => {
  const deliveredAt =
    order.metafields?.delivery_verified_at || order.metafields?.delivery_timestamp || "";

  return (
    <div style={{ borderTop: "1px solid var(--p-color-border)", maxHeight: "520px", overflowY: "auto" }}>
      {/* Header — actions only (no forensic tabs) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          background: "var(--p-color-bg-surface-secondary)",
          position: "sticky",
          top: 0,
          zIndex: 1,
        }}
      >
        <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">
          Order details
        </Text>
        <InlineStack gap="200">
          <Button icon={ExternalIcon} size="slim" onClick={onViewFull}>
            View Full Record
          </Button>
          <Button size="slim" onClick={onCollapse} accessibilityLabel="Collapse order details">
            ▲
          </Button>
        </InlineStack>
      </div>
      <div style={{ borderTop: "1px solid var(--p-color-border)" }} />

      {/* Content grid: customer + products | delivery + handoff */}
      <div
        className="grid grid-cols-1 md:grid-cols-[1fr_1fr]"
        style={{ background: "var(--p-color-bg-surface)" }}
      >
        {/* ── Left: Customer + Products ── */}
        <Box padding="400" borderInlineEndWidth="025" borderColor="border">
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">
                CUSTOMER
              </Text>
              <Text as="p" variant="bodySm" fontWeight="medium">
                {order.customerName}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {order.customerEmail}
              </Text>
              {order.customerAddress && (
                <Text as="p" variant="bodySm" tone="subdued">
                  {order.customerAddress.address1}
                  <br />
                  {order.customerAddress.city}, {order.customerAddress.provinceCode}{" "}
                  {order.customerAddress.zip}
                </Text>
              )}
            </BlockStack>

            <BlockStack gap="100">
              <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">
                PRODUCTS
              </Text>
              {order.items.map((item, idx) => (
                <InlineStack key={idx} align="space-between">
                  <BlockStack gap="0">
                    <Text as="p" variant="bodySm">
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
              <div style={{ borderTop: "1px solid var(--p-color-border)", paddingTop: "8px" }}>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Subtotal
                  </Text>
                  <Text as="span" variant="bodySm">
                    {fmt(order.subtotal, order.currency)}
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Shipping
                  </Text>
                  <Text as="span" variant="bodySm">
                    Free
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm" fontWeight="semibold">
                    Total
                  </Text>
                  <Text as="span" variant="bodySm" fontWeight="semibold">
                    {fmt(order.total, order.currency)}
                  </Text>
                </InlineStack>
              </div>
            </BlockStack>
          </BlockStack>
        </Box>

        {/* ── Right: Delivery + handoff (no forensics in the embed) ── */}
        <Box padding="400">
          <BlockStack gap="300">
            <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">
              DELIVERY
            </Text>
            {deliveredAt ? (
              <InlineStack align="space-between">
                <Text as="span" variant="bodySm" tone="subdued">
                  Delivered
                </Text>
                <Text as="span" variant="bodySm">
                  {formatTimestamp(deliveredAt)}
                </Text>
              </InlineStack>
            ) : (
              <Text as="p" variant="bodySm" tone="subdued">
                No delivery recorded yet.
              </Text>
            )}
            <div style={{ borderTop: "1px solid var(--p-color-border)", paddingTop: "8px" }}>
              <Text as="p" variant="bodySm" tone="subdued">
                Open history, location, and the signed delivery record live in your
                ink. studio.
              </Text>
            </div>
          </BlockStack>
        </Box>
      </div>
    </div>
  );
};

export default OrderExpandedRow;
