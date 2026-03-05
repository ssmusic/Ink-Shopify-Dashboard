import { useShop } from "../contexts/ShopContext";
import { ChevronDown } from "lucide-react";
import { useRouteLoaderData } from "react-router";

export default function ShopSwitcher() {
  const { currentShop } = useShop();
  
  // Try to use true dynamic router data first
  const shopData = useRouteLoaderData("routes/app.settings") as any;
  const displayDomain = shopData?.primaryDomain || shopData?.shopDomain || currentShop?.domain || "Select Store";

  return (
    <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-background w-fit cursor-pointer hover:bg-muted/50 transition-colors">
      <span className="text-sm font-medium">{displayDomain}</span>
      <ChevronDown className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}
