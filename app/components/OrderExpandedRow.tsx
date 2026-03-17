import { useState, useEffect } from "react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  InlineStack,
  Text,
  Thumbnail,
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

// ─────────────────────────────────────────────
// PackagePhotosRow — fetches photos from /api/retrieve/:id
// Same logic as PackagePhotos in OrderDetailView, compact display
// ─────────────────────────────────────────────
function PackagePhotosRow({ proofId }: { proofId: string }) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!proofId || proofId === "—") {
      setLoading(false);
      return;
    }
    fetch(`/api/retrieve/${proofId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.media_items?.length > 0) {
          setPhotos(data.media_items.map((m: any) => m.url || m.media_url).filter(Boolean));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [proofId]);

  return (
    <BlockStack gap="200">
      <Text as="p" tone="subdued" variant="bodySm">Package Photos</Text>
      {loading ? (
        <Text as="p" tone="subdued" variant="bodySm">Loading photos…</Text>
      ) : photos.length > 0 ? (
        <>
          <InlineStack gap="200" wrap>
            {photos.map((url, i) => (
              <button
                key={i}
                onClick={() => setLightbox(url)}
                style={{
                  border: "1px solid var(--p-color-border)",
                  borderRadius: "4px",
                  overflow: "hidden",
                  cursor: "pointer",
                  background: "none",
                  padding: 0,
                }}
              >
                <Thumbnail source={url} alt={`Photo ${i + 1}`} size="large" />
              </button>
            ))}
          </InlineStack>

          {/* Inline lightbox */}
          {lightbox && (
            <div
              onClick={() => setLightbox(null)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
                cursor: "zoom-out",
              }}
            >
              <img
                src={lightbox}
                alt="Package photo"
                style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain" }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </>
      ) : (
        <div
          style={{
            background: "var(--p-color-bg-surface-secondary)",
            borderRadius: "8px",
            padding: "16px",
            textAlign: "center",
            border: "2px dashed var(--p-color-border)",
          }}
        >
          <Text as="p" tone="subdued" variant="bodySm">No photos uploaded yet</Text>
        </div>
      )}
    </BlockStack>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────
const OrderExpandedRow = ({ order, onCollapse, onViewFull }: OrderExpandedRowProps) => {
  const [selectedTab, setSelectedTab] = useState(0);

  const eventTabs = [
    { id: "write", content: "Write" },
    { id: "tap", content: "Tap" },
  ];

  // Parse delivery GPS — stored as JSON {"lat":..,"lng":..} or as "lat, lng" string
  let deliveryCoords: { lat: number; lng: number } | undefined;
  if (order.metafields?.delivery_gps) {
    try {
      const parsed = JSON.parse(order.metafields.delivery_gps);
      if (parsed.lat !== undefined && parsed.lng !== undefined) {
        deliveryCoords = { lat: Number(parsed.lat), lng: Number(parsed.lng) };
      }
    } catch {
      const parts = order.metafields.delivery_gps.split(",").map((s: string) => parseFloat(s.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        deliveryCoords = { lat: parts[0], lng: parts[1] };
      }
    }
  }

  // Parse warehouse GPS — stored as JSON {"lat":..,"lng":..}
  let warehouseLabel = "—";
  let warehouseCoordStr = "";
  if (order.metafields?.warehouse_gps) {
    try {
      const wgps = JSON.parse(order.metafields.warehouse_gps);
      warehouseCoordStr = `${Number(wgps.lat).toFixed(4)}, ${Number(wgps.lng).toFixed(4)}`;
      warehouseLabel = "Warehouse";
    } catch {
      warehouseCoordStr = order.metafields.warehouse_gps;
      warehouseLabel = "Warehouse";
    }
  }

  const fullAddress = order.customerAddress
    ? `${order.customerAddress.address1}, ${order.customerAddress.city}, ${order.customerAddress.provinceCode} ${order.customerAddress.zip}`
    : "";

  const addressLabel = order.customerAddress
    ? `${order.customerAddress.city}, ${order.customerAddress.provinceCode} ${order.customerAddress.zip}`
    : "";

  const proofId = order.metafields?.proof_reference || "";
  const nfcUid = order.metafields?.nfc_uid || "—";
  const deviceInfo = order.metafields?.device_info || "";
  const verifiedAt = order.metafields?.delivery_verified_at || order.metafields?.delivery_timestamp || "";
  const verifyUrl = order.metafields?.verify_url || "";
  const gpsVerdict = order.metafields?.gps_verdict || "";
  const distanceFromAddress = order.metafields?.distance_from_address || "";

  // GPS verdict badge — only show for genuine results, hide when "unknown"
  const showVerdictBadge = gpsVerdict && gpsVerdict.toLowerCase() !== "unknown";
  const verdictIsMatch = gpsVerdict.toLowerCase() === "match";

  const hasTapData = order.status === "verified" || order.status === "enrolled" || !!verifiedAt;

  return (
    <div style={{ borderTop: "1px solid var(--p-color-border)", maxHeight: "520px", overflowY: "auto" }}>
      {/* Sticky header with tab bar */}
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

      {/* Content grid: customer+products | tab content */}
      <div
        className="grid grid-cols-1 md:grid-cols-[1fr_2fr]"
        style={{ background: "var(--p-color-bg-surface)" }}
      >
        {/* ── Left: Customer + Products ── */}
        <Box padding="400" borderInlineEndWidth="025" borderColor="border">
          <BlockStack gap="400">
            <BlockStack gap="100">
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

            <BlockStack gap="100">
              <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">PRODUCTS</Text>
              {order.items.map((item, idx) => (
                <InlineStack key={idx} align="space-between">
                  <BlockStack gap="0">
                    <Text as="p" variant="bodySm">{item.title}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {item.sku ? `${item.sku} × ` : ""}{item.quantity}
                    </Text>
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
                  <Text as="span" variant="bodySm" fontWeight="semibold">
                    {fmt(order.total, order.currency)}
                  </Text>
                </InlineStack>
              </div>
            </BlockStack>
          </BlockStack>
        </Box>

        {/* ── Right: Write / Tap tab content ── */}
        <Box padding="400">
          <div style={{ position: "relative" }}>

            {/* ── WRITE TAB ── */}
            <div
              style={
                selectedTab === 0
                  ? {}
                  : { visibility: "hidden", height: 0, overflow: "hidden", position: "absolute", width: "100%" }
              }
            >
              <BlockStack gap="400">
                {/* NFC UID + Proof ID */}
                <InlineStack gap="400" wrap={false}>
                  <div style={{ flex: 1, background: "var(--p-color-bg-surface-secondary)", padding: "12px", borderRadius: "8px" }}>
                    <Text as="p" tone="subdued" variant="bodySm">NFC Tag UID</Text>
                    <Text as="p" variant="bodySm" fontWeight="medium">
                      <code style={{ fontFamily: "monospace" }}>{nfcUid}</code>
                    </Text>
                  </div>
                  <div style={{ flex: 1, background: "var(--p-color-bg-surface-secondary)", padding: "12px", borderRadius: "8px" }}>
                    <Text as="p" tone="subdued" variant="bodySm">Proof ID</Text>
                    <Text as="p" variant="bodySm" fontWeight="medium">
                      <code style={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                        {proofId || "—"}
                      </code>
                    </Text>
                  </div>
                </InlineStack>

                {/* Warehouse GPS */}
                {warehouseCoordStr && (
                  <div style={{ background: "var(--p-color-bg-surface-secondary)", padding: "12px", borderRadius: "8px" }}>
                    <Text as="p" tone="subdued" variant="bodySm">Warehouse</Text>
                    <Text as="p" variant="bodySm" fontWeight="medium">{warehouseLabel}</Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      <code style={{ fontFamily: "monospace", fontSize: "12px" }}>{warehouseCoordStr}</code>
                    </Text>
                  </div>
                )}

                {/* Package Photos — fetched from INK API */}
                {proofId && <PackagePhotosRow proofId={proofId} />}
              </BlockStack>
            </div>

            {/* ── TAP TAB ── */}
            <div
              style={
                selectedTab === 1
                  ? {}
                  : { visibility: "hidden", height: 0, overflow: "hidden", position: "absolute", width: "100%" }
              }
            >
              {hasTapData ? (
                <BlockStack gap="500">
                  {/* Timeline */}
                  <BlockStack gap="300">
                    <Text as="p" tone="subdued" variant="bodySm" fontWeight="medium">Timeline</Text>

                    {/* Tapped event */}
                    {verifiedAt ? (
                      <InlineStack gap="300" blockAlign="start">
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--p-color-text)", marginTop: 4, flexShrink: 0 }} />
                        <BlockStack gap="100">
                          <Text as="p" variant="bodySm" fontWeight="medium">Tapped</Text>
                          <Text as="p" tone="subdued" variant="bodySm">{formatTimestamp(verifiedAt)}</Text>
                          {deviceInfo && <Badge>{deviceInfo}</Badge>}
                        </BlockStack>
                      </InlineStack>
                    ) : (
                      <InlineStack gap="300" blockAlign="start">
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--p-color-border)", marginTop: 4, flexShrink: 0 }} />
                        <Text as="p" tone="subdued" variant="bodySm">Waiting for customer tap…</Text>
                      </InlineStack>
                    )}

                    {/* Location verified */}
                    {deliveryCoords && (
                      <InlineStack gap="300" blockAlign="start">
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--p-color-text)", marginTop: 4, flexShrink: 0 }} />
                        <BlockStack gap="100">
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="p" variant="bodySm" fontWeight="medium">Location verified</Text>
                            {showVerdictBadge && (
                              <span style={{
                                fontSize: "10px",
                                fontWeight: 700,
                                padding: "2px 6px",
                                borderRadius: "4px",
                                background: verdictIsMatch ? "#dcfce7" : "#fee2e2",
                                color: verdictIsMatch ? "#166534" : "#991b1b",
                              }}>
                                {gpsVerdict.toUpperCase()}
                              </span>
                            )}
                          </InlineStack>
                          {distanceFromAddress && (
                            <Text as="p" tone="subdued" variant="bodySm">{distanceFromAddress} from shipping address</Text>
                          )}
                          <Text as="p" tone="subdued" variant="bodySm">
                            <code style={{ fontFamily: "monospace", fontSize: "11px" }}>
                              {deliveryCoords.lat.toFixed(6)}, {deliveryCoords.lng.toFixed(6)}
                            </code>
                          </Text>
                        </BlockStack>
                      </InlineStack>
                    )}

                    {/* Confirmation sent */}
                    <InlineStack gap="300" blockAlign="start">
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--p-color-border)", marginTop: 4, flexShrink: 0 }} />
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" fontWeight="medium">Confirmation sent</Text>
                        <Text as="p" tone="subdued" variant="bodySm">
                          Delivery record sent to {order.customerEmail || "customer"}
                        </Text>
                        {verifyUrl && (
                          <a
                            href={verifyUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "12px",
                              padding: "4px 10px",
                              border: "1px solid var(--p-color-border)",
                              borderRadius: "4px",
                              color: "var(--p-color-text)",
                              textDecoration: "none",
                            }}
                          >
                            View Public Proof
                          </a>
                        )}
                      </BlockStack>
                    </InlineStack>
                  </BlockStack>

                  {/* Tap Location map */}
                  {deliveryCoords && (
                    <BlockStack gap="200">
                      <Text as="p" tone="subdued" variant="bodySm" fontWeight="medium">Tap Location</Text>
                      <TapLocationCard
                        lat={deliveryCoords.lat}
                        lng={deliveryCoords.lng}
                        address={addressLabel}
                        fullAddress={fullAddress}
                        distanceFromAddress={distanceFromAddress}
                      />
                    </BlockStack>
                  )}
                </BlockStack>
              ) : (
                <BlockStack gap="200" inlineAlign="center">
                  <Text as="p" variant="bodySm" fontWeight="medium" tone="subdued">No tap has been recorded</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Waiting for customer to tap the NFC tag</Text>
                </BlockStack>
              )}
            </div>
          </div>
        </Box>
      </div>
    </div>
  );
};

export default OrderExpandedRow;
