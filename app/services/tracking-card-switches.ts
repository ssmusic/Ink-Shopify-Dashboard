// THE THREE SWITCHES ON THE TRACKING-LINK CARD — one author for their defaults.
//
// Each of these is a per-merchant field on the embed's own merchant doc, and
// each has a default that is a PRODUCT DECISION, not a coding convenience:
//
//   branded_tracking_link   DEFAULT ON  — Sam, 2026-08-06. "Track your shipment"
//                                         lands on the brand's page.
//   shopify_shipping_email  DEFAULT ON  — Sam, 2026-09-05. "the email from
//                                         shopify should have a link to the
//                                         buyers in.ink order."
//   brand_page_email        DEFAULT OFF — a SECOND email to somebody else's
//                                         customer is the merchant's call.
//
// The defaults lived in three places for the first switch alone — the route's
// GET, the route's PATCH and the service that reads it — and "absent means on"
// is exactly the kind of rule that drifts into "absent means off" in one of
// them. So it is written once, here, and every reader imports it.

export const SWITCH_FIELDS = {
  enabled: "branded_tracking_link",
  shopifyShippingEmail: "shopify_shipping_email",
  brandPageEmail: "brand_page_email",
} as const;

export interface TrackingCardSwitches {
  enabled: boolean;
  shopifyShippingEmail: boolean;
  brandPageEmail: boolean;
}

/** ON unless the doc says `false`. The emergency exit, never the opt-in. */
export function brandedTrackingLinkEnabled(data: Record<string, unknown> | null | undefined): boolean {
  return data?.[SWITCH_FIELDS.enabled] !== false;
}

/** ON unless the doc says `false`. Sam's ruling is the default. */
export function shippingNoticeEnabled(data: Record<string, unknown> | null | undefined): boolean {
  return data?.[SWITCH_FIELDS.shopifyShippingEmail] !== false;
}

/** OFF unless the doc says `true`. The mirror image, and deliberately so. */
export function brandPageEmailEnabled(data: Record<string, unknown> | null | undefined): boolean {
  return data?.[SWITCH_FIELDS.brandPageEmail] === true;
}

/** What the card should show for this merchant. */
export function readTrackingCardSwitches(
  data: Record<string, unknown> | null | undefined,
): TrackingCardSwitches {
  return {
    enabled: brandedTrackingLinkEnabled(data),
    shopifyShippingEmail: shippingNoticeEnabled(data),
    brandPageEmail: brandPageEmailEnabled(data),
  };
}

/** The Firestore fields an untrusted PATCH body is allowed to move.
 *
 *  Only known keys survive and only a literal boolean moves a switch — the
 *  same discipline `sanitizeNotificationSettings` uses, for the same reason:
 *  the old route wrote what it was handed. An empty result means the body
 *  named nothing we recognise, and the caller answers 400 rather than
 *  reporting a save that changed nothing. */
export function trackingCardUpdatesFrom(body: unknown): Record<string, boolean> {
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const updates: Record<string, boolean> = {};
  for (const [key, field] of Object.entries(SWITCH_FIELDS)) {
    const value = raw[key];
    if (value === true || value === false) updates[field] = value;
  }
  return updates;
}
