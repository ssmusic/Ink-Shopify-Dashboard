import { useState, useEffect } from "react";
import { ArrowLeft, Copy, Mail, MapPin, ExternalLink, Package, Smartphone, Box, Upload, RefreshCw } from "lucide-react";
import { useFetcher, useRouteLoaderData } from "react-router";
import { LifecycleBadge, type LifecycleState } from "./ui/lifecycle-badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
// ... existing imports

interface OrderItem {
  title: string;
  quantity: number;
  price: string;
  sku: string;
}

interface Order {
  id: string; // Numeric ID
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
  const fetcher = useFetcher();
  const [activeTab, setActiveTab] = useState<"write" | "tap">("write");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [nfcInput, setNfcInput] = useState("");

  // Get activeShop from the settings loader or derive from URL
  const settingsData = useRouteLoaderData("routes/app.settings") as any;
  const shopUrlSlug = (() => {
    if (settingsData?.shopDomain) {
      return settingsData.shopDomain.replace(".myshopify.com", "");
    }
    // Fallback: try to parse from the current URL (Shopify embeds the shop slug in the frame URL)
    try {
      const params = new URLSearchParams(window.location.search);
      const shopParam = params.get("shop") || "";
      return shopParam.replace(".myshopify.com", "") || "admin";
    } catch {
      return "admin";
    }
  })();

  const isEnrolling = fetcher.state === "submitting" && fetcher.formData?.get("intent") === "enroll";
  const isUploading = fetcher.state === "submitting" && fetcher.formData?.get("intent") === "upload";

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const handleEnroll = () => {
    if (!nfcInput) return;
    fetcher.submit(
      { intent: "enroll", orderId: order.id, nfcToken: nfcInput },
      { method: "post" }
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const formData = new FormData();
      formData.append("intent", "upload");
      formData.append("file", e.target.files[0]);
      formData.append("proofId", order.metafields.proof_reference || ""); // INK API requires proof_id, not nfc_token
      fetcher.submit(formData, { method: "post", encType: "multipart/form-data" });
    }
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
  const verifyUrl = order.metafields.verify_url || "";
  const gpsVerdict = order.metafields.gps_verdict || "";

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
            onClick={() => window.open(`https://admin.shopify.com/store/${shopUrlSlug}/orders/${order.id}`, '_blank')}
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

          {order.status !== "pending" && order.status !== "pending_enrollment" && proofId !== "—" ? (
             /* Already Enrolled - Show Timeline & Details */
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
                       <p className="text-xs text-muted-foreground mb-1">Warehouse Location</p>
                       <p className="text-sm font-medium text-foreground">
                         {warehouseName}
                       </p>
                       <div className="flex items-center gap-2 mt-0.5">
                         <p className="text-xs font-mono text-muted-foreground">
                           {warehouseCoords}
                         </p>
                         {warehouseCoords !== "—" && (
                           <a 
                             href={`https://www.google.com/maps/search/?api=1&query=${warehouseCoords.replace(' ', '')}`} 
                             target="_blank" 
                             rel="noreferrer"
                             className="text-xs text-primary hover:underline"
                           >
                             (View Map)
                           </a>
                         )}
                       </div>
                       {warehouseCoords !== "—" && (
                         <div className="mt-3 w-full h-32 rounded bg-muted overflow-hidden">
                           <iframe 
                             width="100%" 
                             height="100%" 
                             frameBorder="0" 
                             style={{border:0}} 
                             src={`https://maps.google.com/maps?q=${warehouseCoords.replace(' ', '')}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                           ></iframe>
                         </div>
                       )}
                     </div>
   
                     {/* Package Photos */}
                     <PackagePhotos proofId={proofId} nfcTagUid={nfcUid} isUploading={isUploading} handleFileUpload={handleFileUpload} />
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
                               <div className="flex items-center gap-2">
                                 <p className="text-sm font-medium text-foreground">Location verified</p>
                                 {gpsVerdict && (
                                   <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                     gpsVerdict.toLowerCase() === 'match' 
                                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                   }`}>
                                     {gpsVerdict}
                                   </span>
                                 )}
                               </div>
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
   
                           {/* Confirmation & Public Proof */}
                           <div className="flex gap-3">
                             <div className="flex flex-col items-center">
                               <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/50 mt-1" />
                             </div>
                             <div>
                               <p className="text-sm font-medium text-foreground">Confirmation sent</p>
                               <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                                 Delivery record sent to {order.customerEmail || "customer"}
                               </p>
                               
                               {verifyUrl && (
                                 <a 
                                   href={verifyUrl} 
                                   target="_blank" 
                                   rel="noreferrer"
                                   className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground rounded border hover:bg-secondary/80 transition-colors"
                                 >
                                   <ExternalLink className="w-3.5 h-3.5" />
                                   View Public Proof
                                 </a>
                               )}
                             </div>
                           </div>
                         </div>
   
                         {/* Right: Tap Location */}
                         <div className="p-4 sm:p-6 border-t lg:border-t-0 border-border">
                           <p className="text-xs text-muted-foreground uppercase tracking-wide mb-4">Tap Location</p>
                           <div className="bg-secondary/50 rounded-sm p-4 space-y-2">
                             <div className="flex items-start gap-2">
                               <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                               <div className="w-full">
                                 {order.customerAddress ? (
                                   <p className="text-sm text-foreground">
                                     {order.customerAddress.city}, {order.customerAddress.provinceCode} {order.customerAddress.zip}
                                   </p>
                                 ) : (
                                   <p className="text-sm text-muted-foreground">Address not available</p>
                                 )}
                                 {deliveryCoords && (
                                   <>
                                     <p className="text-xs font-mono text-muted-foreground mt-1">{deliveryCoords}</p>
                                     <div className="mt-2 w-full h-32 rounded bg-muted overflow-hidden">
                                       <iframe 
                                         width="100%" 
                                         height="100%" 
                                         frameBorder="0" 
                                         style={{border:0}} 
                                         src={`https://maps.google.com/maps?q=${deliveryCoords.replace(' ', '')}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                                       ></iframe>
                                     </div>
                                   </>
                                 )}
                                 {deliveryDistance && (
                                   <p className="text-xs text-green-600 mt-2">✓ {deliveryDistance} from address</p>
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
          ) : order.status === "pending" || order.status === "pending_enrollment" ? (
             /* Enroll UI */
             <div className="bg-card border border-border rounded-sm p-6 space-y-4">
                 <h3 className="text-sm font-medium">Enroll Order</h3>
                 <p className="text-xs text-muted-foreground">Scan or enter an NFC tag to enroll this order.</p>
                 <div className="flex gap-2">
                     <Input 
                         value={nfcInput} 
                         onChange={(e) => setNfcInput(e.target.value)} 
                         placeholder="NFC Token / UID" 
                     />
                     <Button onClick={handleEnroll} disabled={isEnrolling || !nfcInput}>
                         {isEnrolling ? "Enrolling..." : "Enroll"}
                     </Button>
                 </div>
             </div>
          ) : (
             <div className="bg-card border border-border rounded-sm p-8 text-center">
                <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-sm font-medium text-foreground mb-1">Unknown Status</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    This order is in an unknown state: {order.status}
                </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// Subcomponent to handle photo loading logic smoothly without reloading the entire parent
function PackagePhotos({ proofId, nfcTagUid, isUploading, handleFileUpload }: { proofId: string, nfcTagUid?: string, isUploading: boolean, handleFileUpload: any }) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // INK API uses NFC tokens to fetch proofs. If we have a valid nfcTagUid, use it. Otherwise fallback to proofId
    const lookupId = (nfcTagUid && nfcTagUid !== "—") ? nfcTagUid : proofId;
    
    if (!lookupId || lookupId === "—") {
      setLoading(false);
      return;
    }
    
    fetch(`/api/retrieve/${lookupId}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.media_items && data.media_items.length > 0) {
          setPhotos(data.media_items.map((m: any) => m.url));
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load photos:", err);
        setLoading(false);
      });
  }, [proofId, isUploading]); // Reload if an upload finishes

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
          <p className="text-xs text-muted-foreground">Package Photos</p>
          <div className="relative">
              <input 
                 type="file" 
                 id="photo-upload" 
                 className="hidden" 
                 accept="image/*"
                 onChange={handleFileUpload}
                 disabled={isUploading}
              />
              <label htmlFor="photo-upload" className="text-xs text-primary cursor-pointer flex items-center gap-1 hover:underline">
                 <Upload className="h-3 w-3" />
                 {isUploading ? "Uploading..." : "Upload Photo"}
              </label>
          </div>
      </div>
      
      {loading ? (
        <div className="p-8 flex justify-center text-muted-foreground">
           <RefreshCw className="h-5 w-5 animate-spin opacity-50" />
        </div>
      ) : photos.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {photos.map((url, i) => (
            <a href={url} target="_blank" rel="noreferrer" key={i} className="aspect-square border border-border rounded-sm bg-secondary overflow-hidden hover:opacity-90 transition-opacity">
              <img src={url} alt={`Package Proof ${i+1}`} className="w-full h-full object-cover" />
            </a>
          ))}
        </div>
      ) : (
        <div className="bg-secondary/50 rounded-sm p-8 text-center border border-dashed border-border">
          <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">No photos uploaded yet</p>
        </div>
      )}
    </div>
  );
}
