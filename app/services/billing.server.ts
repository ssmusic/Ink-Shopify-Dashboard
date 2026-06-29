// Billing — usage charges for completed returns ($2.50 each), via the Shopify
// Billing API's appUsageRecordCreate.
//
// Architecture (per the build bible §4 + verified against shopify.dev):
//   - The recurring tiers ($299/$599/$1,299 by receipts) are defined in the
//     Partner Dashboard as a **Managed Pricing** ("Shopify App Pricing") plan,
//     WITH a usage component (a usage line / meter + a high cappedAmount).
//     Shopify renders the plan picker and creates the subscription — the app
//     must NOT call appSubscriptionCreate (it's rejected for managed-pricing
//     apps; see app/routes/app.payment.tsx).
//   - The per-return $2.50 is reported here with appUsageRecordCreate against
//     that subscription's usage line item.
//
// INERT until configured: reportUsageCharge() looks up the active subscription's
// usage line item and **no-ops (skipped:"no_usage_line") if there isn't one** —
// so this changes nothing until Sam defines the managed-pricing plan with a
// usage component in the Partner Dashboard and the merchant is subscribed.

/** Minimal shape of the admin GraphQL client returned by
 *  authenticate.admin() / unauthenticated.admin(). */
type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> }
  ) => Promise<Response>;
};

interface PricingDetails {
  __typename?: string;
}
interface LineItem {
  id: string;
  plan?: { pricingDetails?: PricingDetails | null } | null;
}
interface Subscription {
  id: string;
  name: string;
  status: string;
  lineItems?: LineItem[] | null;
}
interface ActiveSubsResponse {
  data?: {
    currentAppInstallation?: { activeSubscriptions?: Subscription[] | null } | null;
  };
}
interface UsageRecordResponse {
  data?: {
    appUsageRecordCreate?: {
      appUsageRecord?: { id: string } | null;
      userErrors?: { field?: string[] | null; message: string }[] | null;
    } | null;
  };
}

const ACTIVE_SUB_QUERY = `#graphql
  query ActiveSubscriptionUsageLine {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        lineItems {
          id
          plan {
            pricingDetails {
              __typename
              ... on AppUsagePricing {
                terms
                cappedAmount { amount currencyCode }
              }
            }
          }
        }
      }
    }
  }
`;

const USAGE_MUTATION = `#graphql
  mutation CreateReturnUsageCharge(
    $subscriptionLineItemId: ID!
    $description: String!
    $price: MoneyInput!
    $idempotencyKey: String
  ) {
    appUsageRecordCreate(
      subscriptionLineItemId: $subscriptionLineItemId
      description: $description
      price: $price
      idempotencyKey: $idempotencyKey
    ) {
      appUsageRecord { id }
      userErrors { field message }
    }
  }
`;

export interface SubscriptionSummary {
  id: string;
  name: string;
  status: string;
  hasUsageLine: boolean;
}

/** The merchant's active app subscription (for display on the plan page). */
export async function getActiveSubscriptionSummary(
  admin: AdminGraphql
): Promise<SubscriptionSummary | null> {
  const res = await admin.graphql(ACTIVE_SUB_QUERY);
  const json = (await res.json()) as ActiveSubsResponse;
  const subs: Subscription[] = json.data?.currentAppInstallation?.activeSubscriptions || [];
  const active = subs.find((s) => s.status === "ACTIVE") || subs[0];
  if (!active) return null;
  const hasUsageLine = (active.lineItems || []).some(
    (li) => li.plan?.pricingDetails?.__typename === "AppUsagePricing"
  );
  return { id: active.id, name: active.name, status: active.status, hasUsageLine };
}

/** Find the usage-pricing line item id on the active subscription, if any. */
async function findUsageLineItemId(admin: AdminGraphql): Promise<string | null> {
  const res = await admin.graphql(ACTIVE_SUB_QUERY);
  const json = (await res.json()) as ActiveSubsResponse;
  const subs: Subscription[] = json.data?.currentAppInstallation?.activeSubscriptions || [];
  for (const sub of subs) {
    if (sub.status !== "ACTIVE") continue;
    for (const li of sub.lineItems || []) {
      if (li.plan?.pricingDetails?.__typename === "AppUsagePricing") return li.id;
    }
  }
  return null;
}

export interface UsageChargeResult {
  ok: boolean;
  /** Set when there's no usage line item yet — the charge was intentionally not made. */
  skipped?: "no_usage_line";
  recordId?: string;
  errors?: { field?: string[] | null; message: string }[];
}

/**
 * Report a usage charge (e.g. $2.50 for a completed return). Idempotent via
 * idempotencyKey — safe to call more than once for the same return.
 * No-ops (skipped) when the merchant has no usage line item, so callers can fire
 * this unconditionally and it stays inert until managed pricing is set up.
 */
export async function reportUsageCharge(
  admin: AdminGraphql,
  opts: { description: string; amountUsd: number; idempotencyKey?: string }
): Promise<UsageChargeResult> {
  const subscriptionLineItemId = await findUsageLineItemId(admin);
  if (!subscriptionLineItemId) return { ok: false, skipped: "no_usage_line" };

  const res = await admin.graphql(USAGE_MUTATION, {
    variables: {
      subscriptionLineItemId,
      description: opts.description,
      // MoneyInput.amount is a Decimal — send it as a string to avoid float
      // precision surprises on the money path.
      price: { amount: opts.amountUsd.toFixed(2), currencyCode: "USD" },
      idempotencyKey: opts.idempotencyKey,
    },
  });
  const json = (await res.json()) as UsageRecordResponse;
  const payload = json.data?.appUsageRecordCreate;
  const errors = payload?.userErrors || [];
  if (errors.length) return { ok: false, errors };
  return { ok: true, recordId: payload?.appUsageRecord?.id };
}
