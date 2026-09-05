// THE AUTO-LINK — Shopify's own outbox becomes the brand's distribution.
//
// `fulfillmentTrackingInfoUpdate` accepts a custom tracking URL, and that URL
// is what Shopify renders on the admin order page, in the shipping-confirmation
// email, and on the customer's order-status page. So on every fulfillment that
// carries tracking we can point the store's OWN surfaces at the brand's page —
// no template paste, no merchant work, no sends of our own. Every "track your
// shipment" click the store already generates lands on the brand instead of on
// the carrier.
//
// The carrier name and tracking number stay intact and visible, here and on
// our page's meta line. We are not hiding the carrier; we are answering the
// question better than it does.
//
// FOUR REFUSALS, and each one is load-bearing:
//
//  1. THE FEED MUST BE PROVABLY ALIVE. A branded page that says "on its way"
//     forever is WORSE than the carrier link — it burns the one impression
//     this exists to win. We only take the link over when the backend confirms
//     Shippo registration (`shippo_registered` off PATCH /proofs/:id/tracking).
//     Every skip LOGS its tracking_company, so live merchants' real carrier mix
//     writes our expansion list instead of us guessing at it. The gate is an
//     instrument, not a ceiling.
//  2. THE LOOP GUARD. Our own mutation re-fires FULFILLMENTS_UPDATE. A tracking
//     URL already pointing at .in.ink is a no-op, so the echo dies here.
//  3. THE KILL SWITCHES. Env `BRANDED_TRACKING_LINK_DISABLED` turns it off
//     everywhere; `merchants/{shop}.branded_tracking_link === false` turns it
//     off for one merchant. Rollout is default-ON for every merchant (Sam,
//     2026-08-06) — these are the emergency exits, not the opt-in.
//  4. NO SILENT NOTIFICATION. Rewriting a link must never re-send a shipping
//     email to a buyer who already got one — and that sentence has a second
//     half. Until 2026-09-05 this pinned notifyCustomer to false for EVERY
//     buyer, including the ones who got nothing at all: a merchant who
//     fulfills with the notification unticked (3PLs, ShipStation, bulk
//     fulfillment) sends no shipping email, and we refused to send the one
//     that would have carried the brand. Sam's ruling that day: "the email
//     from shopify should have a link to the buyers in.ink order."
//     So the flag is now DECIDED, not pinned: `shouldNotifyCustomer` is asked
//     once, at the last possible moment before the mutation, and it answers
//     from Shopify's own order timeline (shopify-shipping-notice.server.ts).
//     No decider, or a decider that says no, and the value is false exactly
//     as before. The default of this argument is silence.

import { resolveBrandPageUrl } from "./brand-page-url.server";

/** Every way this can end, so callers log the truth rather than a guess. */
export type BrandedTrackingOutcome =
  | "updated"
  | "skipped_disabled_env"
  | "skipped_disabled_merchant"
  | "skipped_already_branded"
  | "skipped_feed_unregistered"
  | "skipped_no_page_url"
  | "skipped_no_fulfillment_id"
  | "failed";

export interface BrandedTrackingResult {
  outcome: BrandedTrackingOutcome;
  url?: string;
  detail?: string;
  /** Did this rewrite ask Shopify to email the buyer? Only ever true when a
   *  decider was supplied AND said yes; the caller stamps its own record off
   *  this, so it must never be optimistic. */
  notifiedCustomer?: boolean;
}

const MUTATION = `#graphql
  mutation InkBrandedTrackingUrl(
    $fulfillmentId: ID!
    $trackingInfoInput: FulfillmentTrackingInput!
    $notifyCustomer: Boolean
  ) {
    fulfillmentTrackingInfoUpdate(
      fulfillmentId: $fulfillmentId
      trackingInfoInput: $trackingInfoInput
      notifyCustomer: $notifyCustomer
    ) {
      fulfillment { id trackingInfo { company number url } }
      userErrors { field message }
    }
  }
`;

/** Is this URL already ours? Guards the echo our own mutation causes. */
export function isBrandedTrackingUrl(url?: string | null): boolean {
  return /(^|\/\/|\.)in\.ink(\/|$)/i.test(String(url || ""));
}

/** Every tracking URL Shopify currently holds for this fulfillment. */
function currentTrackingUrls(payload: any): string[] {
  const urls: string[] = [];
  if (Array.isArray(payload?.tracking_urls)) urls.push(...payload.tracking_urls.map(String));
  if (payload?.tracking_url) urls.push(String(payload.tracking_url));
  return urls.filter(Boolean);
}

function trackingNumbers(payload: any): string[] {
  const nums: string[] = [];
  if (Array.isArray(payload?.tracking_numbers)) nums.push(...payload.tracking_numbers.map(String));
  else if (payload?.tracking_number) nums.push(String(payload.tracking_number));
  return nums.filter(Boolean);
}

export async function assertBrandedTrackingUrl({
  admin,
  shop,
  payload,
  proofId,
  merchantApiKey,
  merchantData,
  shippoRegistered,
  shouldNotifyCustomer,
  label = "branded-tracking-link",
}: {
  admin: { graphql: (query: string, opts?: any) => Promise<Response> };
  shop: string;
  /** The Fulfillment webhook payload. */
  payload: any;
  proofId: string;
  merchantApiKey?: string | null;
  merchantData: Record<string, any>;
  /** From the backend's PATCH /proofs/:id/tracking response. Only `true`
   *  means the Shippo feed is registered and our page can actually speak. */
  shippoRegistered: boolean;
  /** Asked ONCE, immediately before the mutation, and only when a rewrite is
   *  actually going to happen — so an echo or a dead feed costs nothing. It
   *  answers "has this buyer already had a shipping email for this
   *  fulfillment?" from Shopify's own timeline. Absent ⇒ notifyCustomer:false,
   *  byte-identical to every rewrite before 2026-09-05. It must never throw;
   *  a thrown decider is treated as a no. */
  shouldNotifyCustomer?: () => Promise<boolean>;
  label?: string;
}): Promise<BrandedTrackingResult> {
  const carrier = String(payload?.tracking_company || "").trim() || "(no carrier name)";

  if (process.env.BRANDED_TRACKING_LINK_DISABLED) {
    console.log(`🔗 ${label}: OFF by env — leaving Shopify's carrier link in place.`);
    return { outcome: "skipped_disabled_env" };
  }
  if (merchantData?.branded_tracking_link === false) {
    console.log(`🔗 ${label}: OFF for ${shop} — leaving Shopify's carrier link in place.`);
    return { outcome: "skipped_disabled_merchant" };
  }

  const existing = currentTrackingUrls(payload);
  if (existing.length > 0 && existing.every(isBrandedTrackingUrl)) {
    console.log(`🔗 ${label}: already ours — no-op (this is the echo of our own mutation).`);
    return { outcome: "skipped_already_branded" };
  }

  // NO SILENT CAPS: a skipped carrier is the measurement, so it says its own
  // name. This log is the expansion list for utils/shippoCarriers.js.
  if (shippoRegistered !== true) {
    console.log(
      `🔗 ${label}: SKIPPED — the carrier feed is not registered for "${carrier}" (shop ${shop}, proof ${proofId}). ` +
        `Shopify's own tracking link stays. Add this carrier to shippoCarriers.js if it keeps appearing.`,
    );
    return { outcome: "skipped_feed_unregistered", detail: carrier };
  }

  const fulfillmentRawId = payload?.id;
  if (!fulfillmentRawId) {
    console.warn(`🔗 ${label}: fulfillment payload carries no id — cannot address the mutation.`);
    return { outcome: "skipped_no_fulfillment_id" };
  }

  const resolved = await resolveBrandPageUrl({ merchantApiKey, proofId, shop, merchantData, label });
  if (!resolved.pageUrl) {
    console.warn(
      `🔗 ${label}: no buyer page URL for proof ${proofId} (nfc_token=${resolved.nfcToken ?? "none"}, ` +
        `brand=${resolved.brandSlug || "none"}) — leaving Shopify's carrier link in place.`,
    );
    return { outcome: "skipped_no_page_url" };
  }

  // Carrier and number are PRESERVED verbatim; only the destination moves.
  // The schema's own rule (FulfillmentTrackingInput): url pairs with number,
  // urls pairs with numbers, and you never mix the two forms. A url with no
  // number would be a malformed write, so no number means no rewrite — the
  // carrier link stays and the buyer keeps whatever Shopify had.
  const numbers = trackingNumbers(payload);
  if (numbers.length === 0) {
    console.log(`🔗 ${label}: fulfillment carries no tracking number — nothing to rewrite.`);
    return { outcome: "skipped_no_page_url", detail: "no tracking number" };
  }
  const trackingInfoInput: Record<string, unknown> = {
    ...(payload?.tracking_company ? { company: String(payload.tracking_company) } : {}),
    // Shopify pairs numbers with urls by index, so a multi-parcel fulfillment
    // gets the same page once per number — every parcel belongs to one order,
    // and the page shows the order.
    ...(numbers.length > 1
      ? { numbers, urls: numbers.map(() => resolved.pageUrl as string) }
      : { number: numbers[0], url: resolved.pageUrl }),
  };

  // THE LAST MOMENT. Everything above has already agreed to rewrite, so this
  // question is asked once per real rewrite and never on a refusal.
  let notifyCustomer = false;
  if (shouldNotifyCustomer) {
    try {
      notifyCustomer = (await shouldNotifyCustomer()) === true;
    } catch (e) {
      // A decider that fell over has not proven the buyer got nothing.
      const said = e instanceof Error ? e.message : String(e);
      console.warn(`🔗 ${label}: the notify decision threw — sending silently. ${said}`);
      notifyCustomer = false;
    }
  }

  try {
    const res = await admin.graphql(MUTATION, {
      variables: {
        fulfillmentId: `gid://shopify/Fulfillment/${fulfillmentRawId}`,
        trackingInfoInput,
        notifyCustomer,
      },
    });
    const json: any = await res.json();
    const userErrors = json?.data?.fulfillmentTrackingInfoUpdate?.userErrors ?? [];
    if (userErrors.length > 0) {
      const detail = userErrors.map((e: any) => `${(e.field || []).join(".")}: ${e.message}`).join("; ");
      console.error(`🔗 ${label}: Shopify refused the rewrite — ${detail}`);
      return { outcome: "failed", detail };
    }
    if (json?.errors?.length) {
      const detail = json.errors.map((e: any) => e.message).join("; ");
      console.error(`🔗 ${label}: GraphQL error — ${detail}`);
      return { outcome: "failed", detail };
    }
    console.log(
      `✅ ${label}: ${carrier} tracking for proof ${proofId} now points at ${resolved.pageUrl}` +
        (notifyCustomer
          ? " — and Shopify is sending its own shipping email, carrying that address."
          : ""),
    );
    return { outcome: "updated", url: resolved.pageUrl, notifiedCustomer: notifyCustomer };
  } catch (e: any) {
    // Webhook discipline: a failed rewrite is a link that stays as Shopify's.
    // It is never a non-200.
    console.error(`🔗 ${label}: rewrite threw (non-fatal) — ${e?.message ?? e}`);
    return { outcome: "failed", detail: String(e?.message ?? e) };
  }
}
