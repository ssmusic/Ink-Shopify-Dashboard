// This app is FREE at App Store submission — no plans are configured in the
// Partner Dashboard, so there is no plan to choose, no charge to approve, and
// no invoice. This card must not imply otherwise: plan language rendered here
// while the listing's pricing field reads "Free" is exactly the inconsistency
// that got the app rejected (requirement 1.2.1).
//
// If paid tiers are ever configured, they run through Shopify (Managed
// Pricing) and this card gains a link to SHOPIFY's own plan picker — built
// from a VERIFIED app handle, never a guessed one. Do not resurrect the
// hardcoded `ink-verified-delivery` fallback: it was never measured against
// the Partner Dashboard, SHOPIFY_APP_HANDLE is set in no environment, and it
// would have put a Shopify 404 in front of the reviewer.
import { CreditCard } from "lucide-react";

const PlanCard = () => {
  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center gap-2 mb-2">
        <CreditCard className="h-4 w-4 text-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">Cost</p>
      </div>
      <p className="text-sm font-medium text-foreground mb-1">
        You&rsquo;re a founding merchant.
      </p>
      <p className="text-sm text-muted-foreground">
        ritualist is free while we build it with a small group of brands. If we
        introduce paid plans later, you&rsquo;ll choose and approve one inside
        Shopify &mdash; nothing will ever start on its own.
      </p>
    </div>
  );
};

export default PlanCard;
