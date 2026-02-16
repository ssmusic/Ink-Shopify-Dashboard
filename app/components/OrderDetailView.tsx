import { useState } from "react";
import { ArrowLeft, Copy, Mail, MapPin, ExternalLink, Package, Smartphone, Box } from "lucide-react";
import { LifecycleBadge, type LifecycleState } from "./ui/lifecycle-badge";
import { Button } from "./ui/button";

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

const formatCurrency = (amount: string | number, currency: string) => {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return num.toLocaleString("en-US", { style: "currency", currency });
};

export default function OrderDetailView({ order, onBack }: OrderDetailViewProps) {
  const [activeTab, setActiveTab] = useState<"write" | "tap">("write");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const hasTapData = order.status === "verified" || order.status === "expired";
  const nfcUid = order.metafields.nfc_uid || "—";
  const proofId = order.metafields.proof_reference || "—";

  // Parse warehouse GPS
  let warehouseName = "Distribution Center";
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

  return (
    <div>
      {/* Order Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={onBack}
            className="flex items-center justify-center w-8 h-8 -ml-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Back to Shipments"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-lg font-semibold text-foreground">
            {order.orderNumber}
          </span>
          <LifecycleBadge state={order.status as LifecycleState} />
          <span className="text-sm text-muted-foreground">
            {order.date}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-sm text-muted-foreground hover:text-foreground gap-1.5"
            onClick={() => window.open(`https://admin.shopify.com/store/smusic-official/orders/${order.id}`, '_blank')}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">View in Shopify</span>
          </Button>
        </div>
      </div>

      {/* Main Content - 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Column 1: Customer + Products */}
        <div className="space-y-6">
          {/* Customer Section */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Customer
            </h2>
            <div className="bg-card border border-border rounded-sm p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">
                {order.customerName}
              </p>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {order.customerEmail || "No email"}
              </p>
              {order.customerAddress && (
                <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <div>
                    <p>{order.customerAddress.address1}</p>
                    <p>{order.customerAddress.city}, {order.customerAddress.provinceCode} {order.customerAddress.zip}</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Products Section */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Products
            </h2>
            <div className="bg-card border border-border rounded-sm divide-y divide-border">
              {order.items.map((item, idx) => (
                <div key={idx} className="p-4 flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.sku ? `${item.sku} × ` : ""}{item.quantity}</p>
                  </div>
                  <p className="text-sm font-medium text-foreground flex-shrink-0">
                    {formatCurrency(item.price, order.currency)}
                  </p>
                </div>
              ))}
              {/* Totals */}
              <div className="p-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatCurrency(order.subtotal, order.currency)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Shipping</span>
                  <span>Free</span>
                </div>
                <div className="flex justify-between font-semibold text-foreground pt-2 border-t border-border">
                  <span>Total</span>
                  <span>{formatCurrency(order.total, order.currency)}</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Column 2: Events */}
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Events
          </h2>

          {order.status === "enrolled" || order.status === "pending" ? (
            /* Pending / Enrolled State */
            <div className="bg-card border border-border rounded-sm p-8 text-center">
              <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm font-medium text-foreground mb-1">Pending Verification</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                This order has been enrolled for INK verified delivery. Waiting for warehouse scan and customer tap.
              </p>
            </div>
          ) : (
            /* Write / Tap Tabs */
            <div className="bg-card border border-border rounded-sm">
              {/* Tab Headers */}
              <div className="border-b border-border">
                <div className="flex">
                  <button
                    onClick={() => setActiveTab("write")}
                    className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === "write"
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Box className="h-4 w-4" />
                    Write
                  </button>
                  <button
                    onClick={() => setActiveTab("tap")}
                    className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === "tap"
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Smartphone className="h-4 w-4" />
                    Tap
                  </button>
                </div>
              </div>

              {/* Write Tab Content */}
              {activeTab === "write" && (
                <div className="p-4 sm:p-6 space-y-5">
                  {/* NFC Tag & Proof ID */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-secondary/40 rounded-sm p-3">
                      <p className="text-xs text-muted-foreground mb-1">NFC Tag UID</p>
                      <code className="text-sm font-mono text-foreground break-all">
                        {nfcUid}
                      </code>
                    </div>
                    <div className="bg-secondary/40 rounded-sm p-3">
                      <p className="text-xs text-muted-foreground mb-1">Proof ID</p>
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono text-foreground">
                          {proofId}
                        </code>
                        {proofId !== "—" && (
                          <button
                            onClick={() => copyToClipboard(proofId, "proofId")}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Copy Proof ID"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {copiedField === "proofId" && (
                          <span className="text-xs text-green-600">Copied!</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Warehouse */}
                  <div className="bg-secondary/50 rounded-sm p-4">
                    <p className="text-xs text-muted-foreground mb-1">Warehouse</p>
                    <p className="text-sm font-medium text-foreground">
                      {warehouseName}
                    </p>
                    <p className="text-xs font-mono text-muted-foreground mt-0.5">
                      {warehouseCoords}
                    </p>
                  </div>

                  {/* Package Photos placeholder */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-3">Package Photos</p>
                    <div className="grid grid-cols-4 gap-3">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className="aspect-square border border-border rounded-sm bg-secondary flex items-center justify-center"
                        >
                          <Package className="h-6 w-6 text-muted-foreground/30" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tap Tab Content */}
              {activeTab === "tap" && (
                <div>
                  {hasTapData ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:divide-x divide-border">
                      {/* Left: Timeline */}
                      <div className="p-4 sm:p-6 space-y-0">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-4">Timeline</p>

                        {/* Tapped */}
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="h-2.5 w-2.5 rounded-full bg-foreground mt-1" />
                            <div className="w-px h-full bg-border min-h-[32px]" />
                          </div>
                          <div className="pb-5">
                            <p className="text-sm font-medium text-foreground">Tapped</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {deliveryVerifiedAt || "Date not available"}
                            </p>
                            {deviceInfo && (
                              <span className="inline-flex items-center mt-2 px-2 py-0.5 rounded border border-border text-[10px] font-medium text-foreground">
                                {deviceInfo}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Location */}
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="h-2.5 w-2.5 rounded-full bg-foreground mt-1" />
                            <div className="w-px h-full bg-border min-h-[32px]" />
                          </div>
                          <div className="pb-5">
                            <p className="text-sm font-medium text-foreground">Location verified</p>
                            {deliveryDistance && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {deliveryDistance} from shipping address
                              </p>
                            )}
                            {deliveryCoords && (
                              <p className="text-xs font-mono text-muted-foreground mt-1">
                                {deliveryCoords}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Confirmation */}
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/50 mt-1" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">Confirmation sent</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Delivery record sent to {order.customerEmail || "customer"}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Right: Tap Location */}
                      <div className="p-4 sm:p-6 border-t lg:border-t-0 border-border">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-4">Tap Location</p>
                        <div className="bg-secondary/50 rounded-sm p-4 space-y-2">
                          <div className="flex items-start gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                            <div>
                              {order.customerAddress ? (
                                <p className="text-sm text-foreground">
                                  {order.customerAddress.city}, {order.customerAddress.provinceCode} {order.customerAddress.zip}
                                </p>
                              ) : (
                                <p className="text-sm text-muted-foreground">Address not available</p>
                              )}
                              {deliveryCoords && (
                                <p className="text-xs font-mono text-muted-foreground mt-1">{deliveryCoords}</p>
                              )}
                              {deliveryDistance && (
                                <p className="text-xs text-green-600 mt-1">✓ {deliveryDistance} from address</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">
                      <Smartphone className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm font-medium">No tap has been recorded</p>
                      <p className="text-xs mt-1">Waiting for customer to tap the NFC tag</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
