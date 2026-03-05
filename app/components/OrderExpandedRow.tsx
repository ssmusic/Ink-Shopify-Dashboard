import { useState } from "react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  InlineStack,
  Text,
} from "@shopify/polaris";
import { ExternalIcon } from "@shopify/polaris-icons";
import TapLocationCard from "./TapLocationCard";

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

interface OrderExpandedRowProps {
  order: Order;
  onCollapse: () => void;
  onViewFull: () => void;
}

const fmt = (amount: string | number, currency: string) => {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return num.toLocaleString("en-US", { style: "currency", currency });
};

const OrderExpandedRow = ({ order, onCollapse, onViewFull }: OrderExpandedRowProps) => {
  const [selectedTab, setSelectedTab] = useState(0);

  const eventTabs = [
    { id: "write", content: "Write" },
    { id: "tap", content: "Tap" },
  ];

  // Parse delivery GPS coords from metafields if available
  const deliveryGps = order.metafields?.delivery_gps;
  let deliveryCoords: { lat: number; lng: number } | undefined;
  if (deliveryGps) {
    const parts = deliveryGps.split(",").map((s: string) => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      deliveryCoords = { lat: parts[0], lng: parts[1] };
    }
  }

  const fullAddress = order.customerAddress
    ? `${order.customerAddress.address1}, ${order.customerAddress.city}, ${order.customerAddress.provinceCode} ${order.customerAddress.zip}`
    : "";

  const addressLabel = order.customerAddress
    ? `${order.customerAddress.city}, ${order.customerAddress.provinceCode} ${order.customerAddress.zip}`
    : "";

  return (
    <div style={{ borderTop: "1px solid var(--p-color-border)", maxHeight: "500px", overflowY: "auto" }}>
      {/* Header with folder-style tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          padding: "0 16px",
          background: "var(--p-color-bg-surface-secondary)",
          position: "sticky",
          top: 0,
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", gap: "0", alignItems: "flex-end", paddingTop: "8px" }}>
          {eventTabs.map((tab, i) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(i)}
              style={{
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                border: "1px solid var(--p-color-border)",
                borderBottom:
                  selectedTab === i
                    ? "1px solid var(--p-color-bg-surface)"
                    : "1px solid var(--p-color-border)",
                background:
                  selectedTab === i ? "var(--p-color-bg-surface)" : "transparent",
                color:
                  selectedTab === i
                    ? "var(--p-color-text)"
                    : "var(--p-color-text-secondary)",
                marginBottom: "-1px",
                borderRadius: "0",
                position: "relative",
                zIndex: selectedTab === i ? 2 : 1,
              }}
            >
              {tab.content}
            </button>
          ))}
        </div>
        <div style={{ paddingBottom: "6px" }}>
          <InlineStack gap="200">
            <Button icon={ExternalIcon} size="slim" onClick={onViewFull}>
              View Full Record
            </Button>
            <Button size="slim" onClick={onCollapse} accessibilityLabel="Collapse order details">
              ▲
            </Button>
          </InlineStack>
        </div>
      </div>
      <div style={{ borderTop: "1px solid var(--p-color-border)" }} />

      {/* Content Grid */}
      <div
        className="grid grid-cols-1 md:grid-cols-[1fr_2fr]"
        style={{ background: "var(--p-color-bg-surface)" }}
      >
        {/* Customer + Products */}
        <Box padding="400" borderInlineEndWidth="025" borderColor="border">
          <BlockStack gap="400">
            {/* Customer */}
            <BlockStack gap="200">
              <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">CUSTOMER</Text>
              <Text as="p" variant="bodySm" fontWeight="medium">{order.customerName}</Text>
              <Text as="p" variant="bodySm" tone="subdued">{order.customerEmail}</Text>
              {order.customerAddress && (
                <Text as="p" variant="bodySm" tone="subdued">
                  {order.customerAddress.address1}<br />
                  {order.customerAddress.city}, {order.customerAddress.provinceCode} {order.customerAddress.zip}
                </Text>
              )}
            </BlockStack>

            {/* Products */}
            <BlockStack gap="200">
              <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">PRODUCTS</Text>
              {order.items.map((item, idx) => (
                <InlineStack key={idx} align="space-between">
                  <BlockStack gap="0">
                    <Text as="p" variant="bodySm">{item.title}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{item.sku} × {item.quantity}</Text>
                  </BlockStack>
                  <Text as="p" variant="bodySm" fontWeight="medium">
                    {fmt(parseFloat(item.price) * item.quantity, order.currency)}
                  </Text>
                </InlineStack>
              ))}
              <div style={{ borderTop: "1px solid var(--p-color-border)", paddingTop: "8px" }}>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm" tone="subdued">Subtotal</Text>
                  <Text as="span" variant="bodySm">{fmt(order.subtotal, order.currency)}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm" tone="subdued">Shipping</Text>
                  <Text as="span" variant="bodySm">Free</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm" fontWeight="semibold">Total</Text>
                  <Text as="span" variant="bodySm" fontWeight="semibold">{fmt(order.total, order.currency)}</Text>
                </InlineStack>
              </div>
            </BlockStack>
          </BlockStack>
        </Box>

        {/* Events — tab content */}
        <Box padding="400">
          <div style={{ position: "relative" }}>
            {/* Write Tab — NFC / Warehouse info */}
            <div
              style={
                selectedTab === 0
                  ? {}
                  : { visibility: "hidden", height: 0, overflow: "hidden", position: "absolute", width: "100%" }
              }
            >
              <BlockStack gap="400">
                <InlineStack gap="400" wrap={false}>
                  <div
                    style={{
                      flex: 1,
                      background: "var(--p-color-bg-surface-secondary)",
                      padding: "12px",
                      borderRadius: "8px",
                    }}
                  >
                    <Text as="p" tone="subdued" variant="bodySm">NFC Tag UID</Text>
                    <Text as="p" variant="bodySm" fontWeight="medium">
                      <code style={{ fontFamily: "monospace" }}>
                        {order.metafields?.nfc_uid || "—"}
                      </code>
                    </Text>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      background: "var(--p-color-bg-surface-secondary)",
                      padding: "12px",
                      borderRadius: "8px",
                    }}
                  >
                    <Text as="p" tone="subdued" variant="bodySm">Proof ID</Text>
                    <Text as="p" variant="bodySm" fontWeight="medium">
                      <code style={{ fontFamily: "monospace" }}>
                        {order.metafields?.proof_reference || "—"}
                      </code>
                    </Text>
                  </div>
                </InlineStack>

                {order.metafields?.warehouse_gps && (
                  <div
                    style={{
                      background: "var(--p-color-bg-surface-secondary)",
                      padding: "12px",
                      borderRadius: "8px",
                    }}
                  >
                    <Text as="p" tone="subdued" variant="bodySm">Warehouse GPS</Text>
                    <Text as="p" variant="bodySm" fontWeight="medium">
                      <code style={{ fontFamily: "monospace", fontSize: "12px" }}>
                        {order.metafields.warehouse_gps}
                      </code>
                    </Text>
                  </div>
                )}
              </BlockStack>
            </div>

            {/* Tap Tab — Timeline + Location */}
            <div
              style={
                selectedTab === 1
                  ? {}
                  : { visibility: "hidden", height: 0, overflow: "hidden", position: "absolute", width: "100%" }
              }
            >
              <BlockStack gap="600">
                {/* Timeline */}
                <BlockStack gap="400">
                  <Text as="p" tone="subdued" variant="bodySm" fontWeight="medium">Timeline</Text>
                  <BlockStack gap="300">
                    {order.metafields?.delivery_verified_at ? (
                      <InlineStack gap="300" blockAlign="start">
                        <div
                          style={{
                            width: "10px",
                            height: "10px",
                            borderRadius: "50%",
                            background: "var(--p-color-text)",
                            marginTop: "4px",
                            flexShrink: 0,
                          }}
                        />
                        <BlockStack gap="100">
                          <Text as="p" variant="bodySm" fontWeight="medium">Tapped</Text>
                          <Text as="p" tone="subdued" variant="bodySm">
                            {order.metafields.delivery_verified_at}
                          </Text>
                          {order.metafields?.device_info && (
                            <Badge>{order.metafields.device_info}</Badge>
                          )}
                        </BlockStack>
                      </InlineStack>
                    ) : (
                      <Text as="p" tone="subdued" variant="bodySm">No tap events recorded yet.</Text>
                    )}
                    <InlineStack gap="300" blockAlign="start">
                      <div
                        style={{
                          width: "10px",
                          height: "10px",
                          borderRadius: "50%",
                          background: "var(--p-color-text)",
                          marginTop: "4px",
                          flexShrink: 0,
                        }}
                      />
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" fontWeight="medium">Confirmation sent</Text>
                        <Text as="p" tone="subdued" variant="bodySm">
                          Delivery record sent to {order.customerEmail}
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>

                {/* Tap Location */}
                {deliveryCoords && (
                  <BlockStack gap="200">
                    <Text as="p" tone="subdued" variant="bodySm" fontWeight="medium">Tap Location</Text>
                    <TapLocationCard
                      lat={deliveryCoords.lat}
                      lng={deliveryCoords.lng}
                      address={addressLabel}
                      fullAddress={fullAddress}
                      distanceFromAddress={order.metafields?.distance_from_address}
                    />
                  </BlockStack>
                )}
              </BlockStack>
            </div>
          </div>
        </Box>
      </div>
    </div>
  );
};

export default OrderExpandedRow;
