// Billing runs through Shopify App Pricing. Until paid tiers go live in the
// Partner Dashboard, this card must show no invented prices or usage charges.
import { CreditCard } from "lucide-react";

const PlanCard = () => {
  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center gap-2 mb-2">
        <CreditCard className="h-4 w-4 text-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">Your plan</p>
      </div>
      <p className="text-sm text-muted-foreground">
        INK is free during the pilot. When paid plans launch they'll be flat
        monthly tiers, billed through your Shopify invoice — no per-order
        fees, and you'll approve any charge inside Shopify before it starts.
      </p>
    </div>
  );
};

export default PlanCard;
