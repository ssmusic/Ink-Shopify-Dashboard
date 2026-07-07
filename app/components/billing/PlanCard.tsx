// Billing runs through Shopify App Pricing. This card must not invent current
// plan state; Shopify owns plan approval, charges, invoices, and cancellation.
import { CreditCard } from "lucide-react";

const PlanCard = () => {
  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center gap-2 mb-2">
        <CreditCard className="h-4 w-4 text-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">Your plan</p>
      </div>
      <p className="text-sm text-muted-foreground">
        Your INK plan is selected and approved in Shopify. Charges appear on
        your Shopify invoice, and any plan or usage billing starts only after
        Shopify asks you to approve it.
      </p>
    </div>
  );
};

export default PlanCard;
