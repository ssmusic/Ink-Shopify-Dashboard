import { useShop } from "../contexts/ShopContext";
import { ChevronDown } from "lucide-react";

export default function ShopSwitcher() {
  const { currentShop } = useShop();

  return (
    <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-background w-fit">
      <span className="text-sm font-medium">{currentShop?.domain}</span>
      <ChevronDown className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}
