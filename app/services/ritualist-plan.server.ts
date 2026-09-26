// THE RITUALIST'S PLAN, AS SHOPIFY HAS IT.
//
// Billing used to say "Your Shopify plan is Free." — true at the first App
// Store submission, untrue once the Ritualist is paid. Sam, 2026-09-24: "get
// rid of that". This app keeps no price of its own: the plans are Shopify's
// (the listing's pricing), so the page reads the store's active subscription
// from Shopify — `currentAppInstallation.activeSubscriptions`, which every app
// may read for itself, no scope asked — and says it as Shopify has it. A
// failed read is said as one, never as "Free" or as no plan.

export const PLAN_QUERY = `#graphql
  query RitualistPlan {
    shop { plan { partnerDevelopment } }
    currentAppInstallation {
      activeSubscriptions {
        name
        test
        createdAt
        trialDays
        currentPeriodEnd
        lineItems {
          plan {
            pricingDetails {
              __typename
              ... on AppRecurringPricing {
                interval
                price { amount currencyCode }
              }
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

export type RitualistPlan = {
  name: string;
  /** Each price line, as Shopify prices it. ⚠️ PLACEHOLDER wording. */
  lines: string[];
  /** Shopify's test flag, or its explicit development-store designation. */
  test: boolean;
  /** A trial still in progress, calculated from Shopify's creation date and trial days. */
  trialEnd: string | null;
  /** When the current period ends (ISO), if Shopify says. */
  periodEnd: string | null;
};

type Money = { amount?: unknown; currencyCode?: unknown } | null | undefined;

function money(m: Money): string | null {
  const amount = Number(m?.amount);
  const currency = typeof m?.currencyCode === "string" ? m.currencyCode : "";
  if (!Number.isFinite(amount) || !currency) return null;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

const INTERVAL: Record<string, string> = {
  EVERY_30_DAYS: "every 30 days",
  ANNUAL: "a year",
};

/** The active subscriptions, from the query's body; null when the body is not
 *  Shopify's answer (the read failed). */
export function plansFromBody(body: unknown, now = Date.now()): RitualistPlan[] | null {
  const subs = (body as { data?: { currentAppInstallation?: { activeSubscriptions?: unknown } } } | null)
    ?.data?.currentAppInstallation?.activeSubscriptions;
  if (!Array.isArray(subs)) return null;
  const developmentStore = (body as { data?: { shop?: { plan?: { partnerDevelopment?: unknown } } } } | null)
    ?.data?.shop?.plan?.partnerDevelopment === true;
  return subs.map((s) => {
    const sub = s as { name?: unknown; test?: unknown; createdAt?: unknown; trialDays?: unknown; currentPeriodEnd?: unknown; lineItems?: unknown };
    // Shopify defines trialDays from createdAt. currentPeriodEnd is a billing
    // period, so it must never be guessed to be a trial's end instead.
    const createdAt = typeof sub.createdAt === "string" ? Date.parse(sub.createdAt) : NaN;
    const trialEnd = typeof sub.trialDays === "number" && Number.isInteger(sub.trialDays) && sub.trialDays > 0
      ? createdAt + sub.trialDays * 86_400_000
      : NaN;
    const lines: string[] = [];
    for (const item of Array.isArray(sub.lineItems) ? sub.lineItems : []) {
      const p = (item as { plan?: { pricingDetails?: Record<string, unknown> } })?.plan?.pricingDetails;
      if (!p) continue;
      if (p.__typename === "AppRecurringPricing") {
        const price = money(p.price as Money);
        const every = INTERVAL[String(p.interval)] ?? "";
        if (price) lines.push(every ? `${price} ${every}` : price);
      } else if (p.__typename === "AppUsagePricing") {
        const cap = money(p.cappedAmount as Money);
        const terms = typeof p.terms === "string" && p.terms.trim() ? p.terms.trim() : null;
        if (terms) lines.push(terms);
        if (cap) lines.push(`Usage up to ${cap}`);
      }
    }
    return {
      // No stand-in name ("Your plan"): a name Shopify did not send is left out.
      name: typeof sub.name === "string" ? sub.name.trim() : "",
      lines,
      test: sub.test === true || developmentStore,
      trialEnd: Number.isFinite(trialEnd) && trialEnd > now && trialEnd <= 8.64e15
        ? new Date(trialEnd).toISOString()
        : null,
      periodEnd: typeof sub.currentPeriodEnd === "string" ? sub.currentPeriodEnd : null,
    };
  });
}

// The shape record-door.server.ts takes for the same Admin client.
type AdminGraphql = { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<{ json: () => Promise<unknown> }> };

/** The store's plan, read from Shopify; null when the read fails. */
export async function readRitualistPlans(admin: AdminGraphql): Promise<RitualistPlan[] | null> {
  try {
    const res = await admin.graphql(PLAN_QUERY);
    return plansFromBody(await res.json());
  } catch {
    return null;
  }
}
