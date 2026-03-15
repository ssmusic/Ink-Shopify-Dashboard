import { useState, useEffect } from "react";
import { Copy } from "lucide-react";
import { useFetcher, useRouteLoaderData } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  InlineStack,
  Badge,
  Divider,
  Thumbnail,
  Button,
  Modal,
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

export default function OrderDetailView({ order, onBack }: OrderDetailViewProps) {
  const fetcher = useFetcher();
  const [activeTab, setActiveTab] = useState<"write" | "tap">("write");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Get shop slug for "View in Shopify" link
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

  const isUploading =
    fetcher.state === "submitting" &&
    fetcher.formData?.get("intent") === "upload";

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const formData = new FormData();
      formData.append("intent", "upload");
      formData.append("file", e.target.files[0]);
      formData.append("proofId", order.metafields.proof_reference || "");
      fetcher.submit(formData, {
        method: "post",
        encType: "multipart/form-data",
      });
    }
  };

  const hasTapData = order.status === "verified" || order.status === "expired";
  const nfcUid = order.metafields.nfc_uid || "—";
  const proofId = order.metafields.proof_reference || "—";

  // Parse warehouse GPS
  let warehouseCoords = "—";
  if (order.metafields.warehouse_gps) {
    try {
      const gps = JSON.parse(order.metafields.warehouse_gps);
      warehouseCoords = `${gps.lat}, ${gps.lng}`;
    } catch {
      warehouseCoords = order.metafields.warehouse_gps;
    }
  }

  // Parse delivery GPS
  let deliveryCoords = "";
  let deliveryDistance = "";
  if (order.metafields.delivery_gps) {
    try {
      const gps = JSON.parse(order.metafields.delivery_gps);
      deliveryCoords = `${gps.lat}, ${gps.lng}`;
      deliveryDistance = gps.distance || "";
    } catch {
      deliveryCoords = order.metafields.delivery_gps;
    }
  }

  const deliveryVerifiedAt = order.metafields.delivery_verified_at || "";
  const deviceInfo = order.metafields.device_info || "";
  const verifyUrl = order.metafields.verify_url || "";
  const gpsVerdict = order.metafields.gps_verdict || "";
  // Only show a meaningful verdict badge — hide when genuinely unknown
  const showGpsVerdictBadge = gpsVerdict && gpsVerdict.toLowerCase() !== "unknown";

  const statusRaw = order.status?.toLowerCase() || "pending";
  const statusLabel = statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1);

  const addressLabel = order.customerAddress
    ? `${order.customerAddress.city}, ${order.customerAddress.provinceCode} ${order.customerAddress.zip}`
    : "";
  // Keep for customer card only — do NOT show in Tap Location map
  const _ = addressLabel; // suppress unused warning


  const tabItems = [
    { id: "write" as const, content: "Write" },
    { id: "tap" as const, content: "Tap" },
  ];

  return (
    <>
      <Page
        title={order.orderNumber}
        titleMetadata={
          <Badge tone={statusBadgeTone(statusRaw)}>{statusLabel}</Badge>
        }
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
              {/* Customer */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">Customer</Text>
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
                        {order.customerAddress.address1}<br />
                        {order.customerAddress.city},{" "}
                        {order.customerAddress.provinceCode}{" "}
                        {order.customerAddress.zip}
                      </Text>
                    </>
                  )}
                </BlockStack>
              </Card>

              {/* Products */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">Products</Text>
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
                    <Text as="span" tone="subdued" variant="bodySm">Subtotal</Text>
                    <Text as="span" variant="bodySm">{fmt(order.subtotal, order.currency)}</Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued" variant="bodySm">Shipping</Text>
                    <Text as="span" variant="bodySm">Free</Text>
                  </InlineStack>
                  <Divider />
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodySm" fontWeight="semibold">Total</Text>
                    <Text as="span" variant="bodySm" fontWeight="semibold">
                      {fmt(order.total, order.currency)}
                    </Text>
                  </InlineStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          {/* Right column: Events (Write / Tap) */}
          <Layout.Section>
            <div style={{ border: "1px solid var(--p-color-border)" }}>
              {/* Folder-style tab bar */}
              <div style={{
                display: "flex",
                alignItems: "flex-end",
                background: "var(--p-color-bg-surface-secondary)",
                padding: "0 16px",
              }}>
                <div style={{ display: "flex", alignItems: "flex-end", paddingTop: "8px" }}>
                  {tabItems.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      style={{
                        padding: "8px 16px",
                        fontSize: "13px",
                        fontWeight: 500,
                        cursor: "pointer",
                        border: "1px solid var(--p-color-border)",
                        borderBottom:
                          activeTab === tab.id
                            ? "1px solid var(--p-color-bg-surface)"
                            : "1px solid var(--p-color-border)",
                        background:
                          activeTab === tab.id
                            ? "var(--p-color-bg-surface)"
                            : "transparent",
                        color:
                          activeTab === tab.id
                            ? "var(--p-color-text)"
                            : "var(--p-color-text-secondary)",
                        marginBottom: "-1px",
                        borderRadius: "0",
                        position: "relative",
                        zIndex: activeTab === tab.id ? 2 : 1,
                      }}
                    >
                      {tab.content}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ borderTop: "1px solid var(--p-color-border)" }} />

              {/* Tab content */}
              <div style={{ padding: "16px", background: "var(--p-color-bg-surface)" }}>

                {/* ── WRITE TAB ── */}
                {activeTab === "write" && (
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
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="p" variant="bodySm" fontWeight="medium">
                            <code style={{ fontFamily: "monospace" }}>{proofId}</code>
                          </Text>
                          {proofId !== "—" && (
                            <button
                              onClick={() => copyToClipboard(proofId, "proofId")}
                              style={{ background: "none", border: "none", cursor: "pointer", padding: "2px" }}
                              aria-label="Copy Proof ID"
                            >
                              <Copy size={14} />
                            </button>
                          )}
                          {copiedField === "proofId" && (
                            <Text as="span" variant="bodySm" tone="success">Copied!</Text>
                          )}
                        </InlineStack>
                      </div>
                    </InlineStack>

                    {/* Warehouse GPS */}
                    {warehouseCoords !== "—" && (
                      <div style={{ background: "var(--p-color-bg-surface-secondary)", padding: "16px", borderRadius: "8px" }}>
                        <Text as="p" tone="subdued" variant="bodySm">Warehouse Location</Text>
                        <Text as="p" variant="bodySm" fontWeight="medium">
                          Distribution Center
                        </Text>
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="p" variant="bodySm" tone="subdued">
                            <code style={{ fontFamily: "monospace", fontSize: "12px" }}>{warehouseCoords}</code>
                          </Text>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(warehouseCoords)}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: "12px", color: "var(--p-color-text-interactive)" }}
                          >
                            View Map
                          </a>
                        </InlineStack>
                      </div>
                    )}

                    {/* Package Photos */}
                    <PackagePhotos
                      proofId={proofId}
                      nfcTagUid={nfcUid}
                      currency={order.currency}
                      isUploading={isUploading}
                      handleFileUpload={handleFileUpload}
                      onLightbox={setLightboxImage}
                    />
                  </BlockStack>
                )}

                {/* ── TAP TAB ── */}
                {activeTab === "tap" && (
                  hasTapData ? (
                    <InlineStack gap="800" wrap={false} blockAlign="start">
                      {/* Timeline */}
                      <div style={{ flex: 1 }}>
                        <BlockStack gap="400">
                          <Text as="p" tone="subdued" variant="bodySm" fontWeight="medium">Timeline</Text>
                          <BlockStack gap="300">
                            {/* Tapped */}
                            {deliveryVerifiedAt && (
                              <InlineStack gap="300" blockAlign="start">
                                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--p-color-text)", marginTop: 4, flexShrink: 0 }} />
                                <BlockStack gap="100">
                                  <Text as="p" variant="bodySm" fontWeight="medium">Tapped</Text>
                                  <Text as="p" tone="subdued" variant="bodySm">{deliveryVerifiedAt}</Text>
                                  {deviceInfo && (
                                    <span style={{ fontSize: "10px", padding: "2px 6px", border: "1px solid var(--p-color-border)", borderRadius: "4px" }}>
                                      {deviceInfo}
                                    </span>
                                  )}
                                </BlockStack>
                              </InlineStack>
                            )}
                            {/* Location */}
                            {deliveryCoords && (
                              <InlineStack gap="300" blockAlign="start">
                                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--p-color-text)", marginTop: 4, flexShrink: 0 }} />
                                <BlockStack gap="100">
                                  <InlineStack gap="200" blockAlign="center">
                                    <Text as="p" variant="bodySm" fontWeight="medium">Location verified</Text>
                                    {showGpsVerdictBadge && (
                                      <span style={{
                                        fontSize: "10px",
                                        fontWeight: 700,
                                        padding: "2px 6px",
                                        borderRadius: "4px",
                                        background: gpsVerdict.toLowerCase() === "match" ? "#dcfce7" : "#fee2e2",
                                        color: gpsVerdict.toLowerCase() === "match" ? "#166534" : "#991b1b",
                                      }}>
                                        {gpsVerdict.toUpperCase()}
                                      </span>
                                    )}
                                  </InlineStack>
                                  {deliveryDistance && (
                                    <Text as="p" tone="subdued" variant="bodySm">{deliveryDistance} from shipping address</Text>
                                  )}
                                  <Text as="p" tone="subdued" variant="bodySm">
                                    <code style={{ fontFamily: "monospace", fontSize: "12px" }}>{deliveryCoords}</code>
                                  </Text>
                                </BlockStack>
                              </InlineStack>
                            )}
                            {/* Confirmation */}
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
                        </BlockStack>
                      </div>

                      {deliveryCoords && (
                        <div style={{ flex: 1 }}>
                          <BlockStack gap="200">
                            <Text as="p" tone="subdued" variant="bodySm" fontWeight="medium">Tap Location</Text>
                            <div style={{ background: "var(--p-color-bg-surface-secondary)", padding: "16px", borderRadius: "8px" }}>
                              <TapLocationCity coords={deliveryCoords} />
                              <Text as="p" variant="bodySm" tone="subdued">
                                <code style={{ fontFamily: "monospace", fontSize: "12px" }}>{deliveryCoords}</code>
                              </Text>
                              {/* Embedded map */}
                              <div style={{ marginTop: "8px", height: "128px", borderRadius: "4px", overflow: "hidden" }}>
                                <iframe
                                  width="100%"
                                  height="100%"
                                  style={{ border: 0 }}
                                  src={`https://maps.google.com/maps?q=${encodeURIComponent(deliveryCoords)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                                  title="Delivery location"
                                />
                              </div>
                              {deliveryDistance && (
                                <Text as="p" variant="bodySm" tone="success">✓ {deliveryDistance} from address</Text>
                              )}
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(deliveryCoords)}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: "12px", color: "var(--p-color-text-interactive)" }}
                              >
                                Open in Google Maps
                              </a>
                            </div>
                          </BlockStack>
                        </div>
                      )}

                    </InlineStack>
                  ) : (
                    <BlockStack gap="200" inlineAlign="center">
                      <Text as="p" variant="bodySm" fontWeight="medium" tone="subdued">No tap has been recorded</Text>
                      <Text as="p" variant="bodySm" tone="subdued">Waiting for customer to tap the NFC tag</Text>
                    </BlockStack>
                  )
                )}
              </div>
            </div>
          </Layout.Section>
        </Layout>
      </Page>

      {/* Lightbox */}
      <Modal open={!!lightboxImage} onClose={() => setLightboxImage(null)} title="Package Photo">
        <Modal.Section>
          {lightboxImage && (
            <img
              src={lightboxImage}
              alt="Package photo"
              style={{ width: "100%", maxHeight: "80vh", objectFit: "contain" }}
            />
          )}
        </Modal.Section>
      </Modal>
    </>
  );
}

// ─────────────────────────────────────────────
// Package Photos sub-component
// fetches from /api/retrieve/:id (same logic as before)
// ─────────────────────────────────────────────
function PackagePhotos({
  proofId,
  nfcTagUid,
  currency,
  isUploading,
  handleFileUpload,
  onLightbox,
}: {
  proofId: string;
  nfcTagUid?: string;
  currency: string;
  isUploading: boolean;
  handleFileUpload: any;
  onLightbox: (url: string) => void;
}) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ALAN API BUG: /api/proofs/nfc/[uid] does not exist and returns 404.
    // We MUST prefer the proofId (proof_...) over the nfcTagUid.
    const lookupId =
      proofId && proofId !== "—" ? proofId : nfcTagUid;

    if (!lookupId || lookupId === "—") {
      setLoading(false);
      return;
    }

    fetch(`/api/retrieve/${lookupId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.media_items?.length > 0) {
          setPhotos(data.media_items.map((m: any) => m.url));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [proofId, isUploading]);

  return (
    <BlockStack gap="300">
      <InlineStack align="space-between" blockAlign="center">
        <Text as="p" tone="subdued" variant="bodySm">Package Photos</Text>
        <div style={{ position: "relative" }}>
          <input
            type="file"
            id="photo-upload-odv"
            style={{ display: "none" }}
            accept="image/*"
            onChange={handleFileUpload}
            disabled={isUploading}
          />
          <label
            htmlFor="photo-upload-odv"
            style={{ fontSize: "12px", cursor: "pointer", color: "var(--p-color-text-interactive)" }}
          >
            {isUploading ? "Uploading..." : "↑ Upload Photo"}
          </label>
        </div>
      </InlineStack>

      {loading ? (
        <div style={{ padding: "32px", textAlign: "center" }}>
          <Text as="p" tone="subdued" variant="bodySm">Loading photos…</Text>
        </div>
      ) : photos.length > 0 ? (
        <InlineStack gap="300">
          {photos.map((url, i) => (
            <button
              key={i}
              onClick={() => onLightbox(url)}
              style={{ border: "1px solid var(--p-color-border)", borderRadius: "4px", overflow: "hidden", cursor: "pointer", background: "none", padding: 0 }}
            >
              <Thumbnail source={url} alt={`Package Proof ${i + 1}`} size="large" />
            </button>
          ))}
        </InlineStack>
      ) : (
        <div style={{ background: "var(--p-color-bg-surface-secondary)", borderRadius: "8px", padding: "32px", textAlign: "center", border: "2px dashed var(--p-color-border)" }}>
          <Text as="p" tone="subdued" variant="bodySm">No photos uploaded yet</Text>
        </div>
      )}
    </BlockStack>
  );
}

// ─────────────────────────────────────────────
// TapLocationCity - reverse geocodes GPS coords
// using OpenStreetMap Nominatim (free, no key needed)
// ─────────────────────────────────────────────
function TapLocationCity({ coords }: { coords: string }) {
  const [city, setCity] = useState<string | null>(null);

  useEffect(() => {
    if (!coords) return;
    const [lat, lng] = coords.split(",").map((s) => s.trim());
    if (!lat || !lng) return;

    fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "Accept-Language": "en" } }
    )
      .then((r) => r.json())
      .then((data) => {
        const addr = data?.address;
        if (!addr) return;
        // Build a compact city label: "City, Country"
        const cityName = addr.city || addr.town || addr.village || addr.county || addr.state_district || "";
        const state = addr.state || "";
        const country = addr.country_code?.toUpperCase() || addr.country || "";
        const parts = [cityName, state, country].filter(Boolean);
        setCity(parts.join(", "));
      })
      .catch(() => { /* silently ignore */ });
  }, [coords]);

  if (!city) return null;

  return (
    <Text as="p" variant="bodySm" fontWeight="medium">
      {city}
    </Text>
  );
}
