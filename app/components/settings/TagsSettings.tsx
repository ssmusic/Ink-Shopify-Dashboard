import { useState } from "react";
import { Link } from "react-router";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Plus, Image } from "lucide-react";
import { toast } from "../../hooks/use-toast";

// Mock data - in real app this would come from API
const inventoryData = {
  current: 1200,
  usedThisPeriod: 1800,
  allocated: 3000,
  utilization: 60,
};

const orderHistory = [
  { id: "ORD-001", quantity: 500, status: "delivered", date: "Jan 15, 2026", tracking: "1Z999AA10123456784" },
  { id: "ORD-002", quantity: 1000, status: "in_transit", date: "Feb 1, 2026", tracking: "1Z999AA10123456785" },
  { id: "ORD-003", quantity: 250, status: "processing", date: "Feb 10, 2026", tracking: null },
];

const TagsSettings = () => {
  const [autoRefillEnabled, setAutoRefillEnabled] = useState(true);
  const [refillQuantity, setRefillQuantity] = useState("500");
  const [lowInventoryThreshold, setLowInventoryThreshold] = useState(true);
  const [thresholdPercent, setThresholdPercent] = useState("20");
  const [scheduledRefill, setScheduledRefill] = useState(false);
  const [stickerLogo, setStickerLogo] = useState<{ url: string; name: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleAutoRefillToggle = (enabled: boolean) => {
    setAutoRefillEnabled(enabled);
    toast({
      description: enabled ? "Auto-refill enabled" : "Auto-refill disabled",
      duration: 1500,
    });
  };

  const handleLogoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleLogoUpload(file);
  };

  const handleLogoUpload = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ description: "Please upload an image file (PNG, JPG, or SVG).", variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(file);
    setStickerLogo({ url, name: file.name });
    toast({ description: "Logo uploaded", duration: 1500 });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "delivered":
        return <Badge variant="outline" className="bg-muted text-foreground border-border text-xs">Delivered</Badge>;
      case "in_transit":
        return <Badge variant="outline" className="bg-muted text-foreground border-border text-xs">In Transit</Badge>;
      case "processing":
        return <Badge variant="outline" className="bg-secondary text-muted-foreground border-border text-xs">Processing</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-8">
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-sm p-4 sm:p-5">
          <p className="text-xs text-muted-foreground mb-1">Current Inventory</p>
          <p className="text-2xl font-semibold text-foreground tabular-nums">
            {inventoryData.current.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">tags remaining</p>
        </div>

        <div className="bg-card border border-border rounded-sm p-4 sm:p-5">
          <p className="text-xs text-muted-foreground mb-1">Used This Period</p>
          <p className="text-2xl font-semibold text-foreground tabular-nums">
            {inventoryData.usedThisPeriod.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            of {inventoryData.allocated.toLocaleString()} allocated
          </p>
        </div>

        <div className="bg-card border border-border rounded-sm p-4 sm:p-5">
          <p className="text-xs text-muted-foreground mb-1">Utilization</p>
          <p className="text-2xl font-semibold text-foreground tabular-nums">
            {inventoryData.utilization}%
          </p>
          <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-foreground rounded-full transition-all"
              style={{ width: `${inventoryData.utilization}%` }}
            />
          </div>
        </div>
      </div>

      {/* Auto-Refill Settings */}
      <section className="bg-card border border-border rounded-sm">
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Auto-Refill Settings</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Automatically reorder tags based on inventory levels or schedule
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Enabled</span>
            <Switch
              checked={autoRefillEnabled}
              onCheckedChange={handleAutoRefillToggle}
            />
          </div>
        </div>

        <div className={`p-4 sm:p-5 space-y-5 ${!autoRefillEnabled ? "opacity-50 pointer-events-none" : ""}`}>
          {/* Refill Quantity */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-foreground">Refill Quantity</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Number of tags to order per refill
              </p>
            </div>
            <Input
              type="number"
              value={refillQuantity}
              onChange={(e) => setRefillQuantity(e.target.value)}
              className="w-24 text-right"
            />
          </div>

          {/* Trigger Conditions */}
          <div className="pt-4 border-t border-border">
            <p className="text-sm font-medium text-foreground mb-4">Trigger Conditions</p>

            {/* Low Inventory Threshold */}
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-start gap-3">
                <Switch
                  checked={lowInventoryThreshold}
                  onCheckedChange={setLowInventoryThreshold}
                  className="mt-0.5"
                />
                <div>
                  <Label className="text-sm font-medium text-foreground">Low Inventory Threshold</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Trigger refill when inventory drops below a percentage
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={thresholdPercent}
                  onChange={(e) => setThresholdPercent(e.target.value)}
                  className="w-16 text-right"
                  disabled={!lowInventoryThreshold}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>

            {/* Scheduled Refill */}
            <div className="flex items-start gap-3">
              <Switch
                checked={scheduledRefill}
                onCheckedChange={setScheduledRefill}
                className="mt-0.5"
              />
              <div>
                <Label className="text-sm font-medium text-foreground">Scheduled Refill</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatically refill on a regular schedule
                </p>
              </div>
            </div>
          </div>

          {/* Current Configuration */}
          <div className="pt-4 border-t border-border space-y-1.5">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Current Configuration:</span>{" "}
              {refillQuantity} tags will be ordered when inventory falls below {thresholdPercent}%.
            </p>
            <p className="text-xs text-muted-foreground">
              Processing time varies but usually takes about 3 weeks.
            </p>
          </div>
        </div>
      </section>

      {/* Tag Branding */}
      <section className="bg-card border border-border rounded-sm">
        <div className="p-4 sm:p-5 border-b border-border">
          <p className="text-sm font-medium text-foreground">Tag Branding</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Upload your logo to be printed on each NFC tag.
          </p>
        </div>

        <div className="p-6 sm:p-8">
          <div className="flex flex-col items-center gap-5">
            {/* Large circle viewer */}
            <label
              className={`relative w-48 h-48 sm:w-56 sm:h-56 rounded-full border-2 border-dashed flex items-center justify-center overflow-hidden cursor-pointer transition-colors shrink-0 ${
                stickerLogo
                  ? "border-border bg-card"
                  : isDragging
                    ? "border-foreground bg-muted/50"
                    : "border-border hover:border-foreground/50 hover:bg-muted/20"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleLogoDrop}
            >
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLogoUpload(file);
                }}
              />
              {stickerLogo ? (
                <img
                  src={stickerLogo.url}
                  alt="Sticker logo"
                  className="w-full h-full object-contain p-6"
                />
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Image className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Upload</span>
                </div>
              )}
            </label>

            {/* Info + actions below */}
            {stickerLogo ? (
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-foreground">{stickerLogo.name}</p>
                <p className="text-xs text-muted-foreground">
                  Printed on all new tag orders
                </p>
                <div className="flex items-center justify-center gap-3 pt-1">
                  <label className="text-xs text-foreground underline underline-offset-2 cursor-pointer hover:text-foreground/80">
                    Replace
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleLogoUpload(file);
                      }}
                    />
                  </label>
                  <button
                    onClick={() => {
                      setStickerLogo(null);
                      toast({ description: "Logo removed", duration: 1500 });
                    }}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-xs text-muted-foreground">
                  Drag and drop or click to upload • PNG, JPG, SVG
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Order History */}
      <section className="bg-card border border-border rounded-sm">
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Order History</p>
          <Button variant="outline" size="sm" className="gap-2 text-xs" asChild>
            <Link to="/app/reorder-tags">
              <Plus className="h-3 w-3" />
              New Order
            </Link>
          </Button>
        </div>

        {/* Mobile: Card view */}
        <div className="sm:hidden divide-y divide-border">
          {orderHistory.map((order) => (
            <div key={order.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{order.id}</span>
                {getStatusBadge(order.status)}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{order.quantity.toLocaleString()} stickers</span>
                <span>{order.date}</span>
              </div>
              {order.tracking && (
                <p className="text-xs font-mono text-muted-foreground truncate">
                  {order.tracking}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Desktop: Table view */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left font-medium text-muted-foreground p-4 pl-5">Order ID</th>
                <th className="text-left font-medium text-muted-foreground p-4">Quantity</th>
                <th className="text-left font-medium text-muted-foreground p-4">Status</th>
                <th className="text-left font-medium text-muted-foreground p-4">Date</th>
                <th className="text-left font-medium text-muted-foreground p-4 pr-5">Tracking</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orderHistory.map((order) => (
                <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-4 pl-5 font-medium text-foreground">{order.id}</td>
                  <td className="p-4 text-foreground tabular-nums">{order.quantity.toLocaleString()}</td>
                  <td className="p-4">{getStatusBadge(order.status)}</td>
                  <td className="p-4 text-muted-foreground">{order.date}</td>
                  <td className="p-4 pr-5">
                    {order.tracking ? (
                      <span className="font-mono text-xs text-muted-foreground">{order.tracking}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Save Button */}
      <div className="pt-2">
        <Button className="w-full sm:w-auto bg-foreground text-background hover:bg-foreground/90">
          Save Changes
        </Button>
      </div>
    </div>
  );
};

export default TagsSettings;
