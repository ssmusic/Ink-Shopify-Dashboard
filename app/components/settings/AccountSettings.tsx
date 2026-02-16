import { useShop } from "../../contexts/ShopContext";
import { Skeleton } from "../ui/skeleton";
import ShopSwitcher from "../ShopSwitcher";
import { Button } from "../ui/button";
import { ExternalLink } from "lucide-react";

const AccountSettings = () => {
  const { currentShop, loading } = useShop();

  // Mock data - in production this would come from Shopify API
  const storeEmail = "sam@in.ink";
  const installedDate = "Jan 15, 2024";

  const handleUpdateInShopify = () => {
    if (currentShop?.domain) {
      // Extract shop name from domain for Shopify admin URL
      const shopName = currentShop.domain.replace(".myshopify.com", "");
      window.open(`https://admin.shopify.com/store/${shopName}/settings/general`, "_blank");
    }
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-6 w-32 mb-4" />
          <Skeleton className="h-[120px] w-full" />
        </div>
        <div>
          <Skeleton className="h-6 w-32 mb-4" />
          <Skeleton className="h-[140px] w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Section 1: Connected Store */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-5">
          Connected Store
        </h2>

        {/* Shop Switcher */}
        <div className="mb-4">
          <ShopSwitcher />
        </div>

        {/* Store Info */}
        <div className="bg-card border border-border rounded-sm p-6">
          <p className="font-semibold text-foreground truncate mb-4">
            {currentShop?.domain || "No shop selected"}
          </p>

          <div className="space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="text-muted-foreground">Contact:</span>
              <span className="text-foreground">{storeEmail}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground">Installed:</span>
              <span className="text-foreground">{installedDate}</span>
            </div>
          </div>
        </div>

        {/* Update Button - Opens Shopify Admin */}
        <div className="mt-6">
          <Button 
            onClick={handleUpdateInShopify}
            className="w-full sm:w-auto sm:ml-auto sm:block bg-foreground text-background hover:bg-foreground/90"
          >
            Update in Shopify
            <ExternalLink className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </section>

      {/* Section 2: Billing */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-5">
          Billing
        </h2>

        <div className="bg-card border border-border rounded-sm p-6 mb-5">
          <p className="font-semibold text-foreground mb-3">Usage-Based Pricing</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Enrollment fee</span>
              <span className="text-foreground font-medium">$0.99 / shipment</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tap fee</span>
              <span className="text-foreground font-medium">$2.99 / successful tap</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">NFC tag</span>
              <span className="text-foreground font-medium">$0.80 / tag (pass-through)</span>
            </div>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex gap-2">
            <span className="text-muted-foreground">Payment method:</span>
            <span className="text-foreground">•••• 4242</span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground">Next invoice:</span>
            <span className="text-foreground">Mar 1, 2026</span>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AccountSettings;
