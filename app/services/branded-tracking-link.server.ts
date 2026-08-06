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
//  4. NO SILENT NOTIFICATION. notifyCustomer:false — rewriting a link must
//     never re-send a shipping email to a buyer who already got one.

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

  try {
    const res = await admin.graphql(MUTATION, {
      variables: {
        fulfillmentId: `gid://shopify/Fulfillment/${fulfillmentRawId}`,
        trackingInfoInput,
        notifyCustomer: false,
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
    console.log(`✅ ${label}: ${carrier} tracking for proof ${proofId} now points at ${resolved.pageUrl}`);
    return { outcome: "updated", url: resolved.pageUrl };
  } catch (e: any) {
    // Webhook discipline: a failed rewrite is a link that stays as Shopify's.
    // It is never a non-200.
    console.error(`🔗 ${label}: rewrite threw (non-fatal) — ${e?.message ?? e}`);
    return { outcome: "failed", detail: String(e?.message ?? e) };
  }
}
