// Marketing-consent helpers (Phase 5 groundwork).
//
// The doctrine (BRAND_BIBLE + Shopify privacy rules): delivery/shipping/return
// messages are TRANSACTIONAL and send regardless of marketing consent. Any
// MARKETING content — the aimed/campaign block, promos — may only reach a buyer
// whose Shopify marketing consent is SUBSCRIBED. These helpers read Shopify's
// structured consent objects (never the deprecated `acceptsMarketing` boolean).
//
// This module is PURE + side-effect-free. It does NOT yet gate any live send —
// wiring it into the email builder (fetch consent in the order query → pass to
// the campaign block) is the Sam-gated daytime step, because turning enforcement
// on changes what a buyer sees in the aimed-email surface Sam shipped.

// GraphQL fragment to drop into an order/customer query to fetch consent.
// Usage: `customer { email firstName ${CUSTOMER_CONSENT_FRAGMENT} }`
export const CUSTOMER_CONSENT_FRAGMENT = `
  emailMarketingConsent { marketingState }
  smsMarketingConsent { marketingState }
`;

type ConsentObject = { marketingState?: string | null } | null | undefined;

// Shopify marketingState enum: SUBSCRIBED | NOT_SUBSCRIBED | PENDING |
// UNSUBSCRIBED | REDACTED | INVALID. Only SUBSCRIBED clears a marketing send.
export function isEmailMarketingSubscribed(consent: ConsentObject): boolean {
  return consent?.marketingState === "SUBSCRIBED";
}

export function isSmsMarketingSubscribed(consent: ConsentObject): boolean {
  return consent?.marketingState === "SUBSCRIBED";
}

// Message classification — the single source of truth for "does this send need
// marketing consent?" Transactional types send unconditionally; marketing types
// require the matching channel's consent to be SUBSCRIBED.
export type MessageType =
  | "outForDelivery"
  | "delivered"
  | "deliveryConfirmed"
  | "shipped"
  | "return_unlocked"
  | "refund_issued"
  | "hours4"
  | "hours24"
  | "hours48"
  | "return7d"
  | "return48h"
  | "aimed_section"     // marketing — the campaign block
  | "promo";           // marketing

const MARKETING_TYPES = new Set<MessageType>(["aimed_section", "promo"]);

export function isMarketing(type: MessageType): boolean {
  return MARKETING_TYPES.has(type);
}

// The one gate to call before rendering/sending marketing content.
// Transactional types always pass. Marketing types require SUBSCRIBED consent
// on the channel; unknown/missing consent fails CLOSED (transactional only).
export function mayIncludeMarketing(
  type: MessageType,
  channel: "email" | "sms",
  consent: ConsentObject,
): boolean {
  if (!isMarketing(type)) return true;
  return channel === "email"
    ? isEmailMarketingSubscribed(consent)
    : isSmsMarketingSubscribed(consent);
}
