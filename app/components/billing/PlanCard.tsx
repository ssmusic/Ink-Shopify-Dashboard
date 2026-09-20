// The plan this store is on, read from Shopify (Track C, tier billing).
//
// With no plan chosen this card says what it always said — there is no
// charge — because that is still true: nothing starts until a merchant
// chooses one on /app/billing and approves it on Shopify's screen. With one
// chosen it names the plan, the price and the order cap, from the locked
// numbers in services/billing-plans.ts. The words and the listing's pricing
// must match (requirement 1.2.1); this card never invents a number.
import { CreditCard } from "lucide-react";
import type { ActivePlan } from "../../services/billing-plans";

const PlanCard = ({ plan = null }: { plan?: ActivePlan | null }) => {
  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center gap-2 mb-2">
        <CreditCard className="h-4 w-4 text-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">Cost</p>
      </div>
      {plan ? (
        <>
          <p className="text-sm font-medium text-foreground mb-1">
            Your plan is {plan.key} — ${plan.amount.toLocaleString("en-US")}/mo, up to{" "}
            {plan.ordersPerMonth.toLocaleString("en-US")} orders a month.
          </p>
          <p className="text-sm text-muted-foreground">
            Approved inside Shopify and billed on your regular Shopify invoice.
            {plan.test ? " This is a test subscription — no money moves." : ""}{" "}
            Change or cancel it any time on the Billing page.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-foreground mb-1">
            No plan chosen — there is no charge.
          </p>
          {/* PROSE, not the mark: parallelreturns #644 is the naming authority —
              "The Ritualist" sentence-initial, "the Ritualist" mid-sentence, bare
              "Ritualist" adjectival. Only the app-name field and the wordmark are
              lowercase `the ritualist`. The two cases are both correct and must
              not be flattened into each other. */}
          <p className="text-sm text-muted-foreground">
            There is no subscription charge, trial, usage fee, or off-platform
            invoice. Installing the app creates no charge. When you choose a plan
            on the Billing page, Shopify asks you to approve it &mdash; nothing
            starts on its own.
          </p>
        </>
      )}
    </div>
  );
};

export default PlanCard;
