// THE ONE LINE A MERCHANT PASTES — and the reason the old one didn't work.
//
// Shopify has no API for editing a notification template, so this snippet is
// the only way the store's own emails can point at the brand's page. That part
// is unavoidable (AfterShip and Malomo ship the same instruction). What WAS
// avoidable is what the line read.
//
// THE OLD LINE RACED, AND LOST. It was:
//
//     {% if fulfillment.tracking_url %}
//       {% assign order_status_url = fulfillment.tracking_url %}{% endif %}
//
// `fulfillment.tracking_url` is only ours AFTER the branded-tracking-link
// rewrite has run, and that rewrite runs when we RECEIVE the fulfillment
// webhook — i.e. after Shopify has already composed the shipping email.
// Measured on real order #1020, 2026-08-10:
//
//     02:29:33.755  fulfillment created  → Shopify composes + queues the email
//     02:29:34.387  our rewrite lands    → tracking_url finally points at us
//
// Roughly six hundred milliseconds too late, every time, by construction. And
// on the ORDER CONFIRMATION email — which renders before any fulfillment
// exists — `fulfillment.tracking_url` is blank forever, so the line was inert
// there no matter how long you waited. Sam pasted it into that template and
// correctly reported that nothing happened.
//
// THE NEW LINE CANNOT RACE. `ink.ink_token` is written by the orders/create
// webhook at enrollment — on #1020 that was 02:20:32, NINE MINUTES before the
// fulfillment existed. Every email for an enrolled order, in every template,
// can already see it.
//
// The guard matters as much as the assign: when the token is blank (an order
// that predates the app, or one whose enrollment failed) the line leaves
// `order_status_url` exactly as Shopify set it. A merchant who pastes this can
// never end up with a broken button — worst case they get today's behaviour.

/** The metafield the orders/create webhook stamps at enrollment.
 *  `webhooks.orders_create.ts` writes namespace "ink", key "ink_token". */
const TOKEN_METAFIELD = "order.metafields.ink.ink_token";

/** Build the paste-once Liquid for one brand.
 *
 *  `slug` is the brand's own subdomain label, resolved through
 *  `brandSlugFromDoc` so this agrees with the tracking rewrite. A blank slug
 *  falls back to the canonical `www.in.ink`, which resolves for any brand —
 *  never a guessed host, because a wrong-but-plausible one (the myshopify
 *  label, e.g. `sm-test-hhawzn52.in.ink`) is worse than the neutral one: it
 *  looks right and 404s. */
export function notificationSnippet(slug?: string | null): string {
  const clean = String(slug || "").trim();
  const base = clean ? `https://${clean}.in.ink/r/` : "https://www.in.ink/r/";
  return (
    `{% assign ink_token = ${TOKEN_METAFIELD} %}` +
    `{% if ink_token != blank %}` +
    `{% assign order_status_url = "${base}" | append: ink_token %}` +
    `{% endif %}`
  );
}

/** The templates this line belongs in, in the order a buyer meets them.
 *  Order confirmation is FIRST and is the one the old line could never serve. */
export const SNIPPET_TEMPLATES = [
  "Order confirmation",
  "Shipping confirmation",
  "Shipping update",
  "Out for delivery",
  "Delivered",
] as const;
