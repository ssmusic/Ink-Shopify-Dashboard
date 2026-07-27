// Billing runs through Shopify App Pricing. This card must not invent current
// plan state; Shopify owns plan approval, charges, invoices, and cancellation.
import { CreditCard } from "lucide-react";
import { Button } from "@shopify/polaris";
import { useRouteLoaderData } from "react-router";
import type { loader as appLoader } from "../../routes/app";

const PlanCard = () => {
  const appData = useRouteLoaderData<typeof appLoader>("routes/app");

  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center gap-2 mb-2">
        <CreditCard className="h-4 w-4 text-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">Shopify plans</p>
      </div>
      <p className="text-sm text-muted-foreground">
        INK plans are selected and approved in Shopify. No plan starts on
        install. Charges appear on your Shopify invoice only after Shopify
        asks you to approve them.
      </p>
      {appData?.pricingUrl && (
        <div className="mt-4">
          <Button url={appData.pricingUrl} target="_top">
            Choose or change plan
          </Button>
        </div>
      )}
    </div>
  );
};

export default PlanCard;
