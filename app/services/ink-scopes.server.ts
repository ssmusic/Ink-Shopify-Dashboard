// Shopify write scopes include read. Ink updates orders and tracking at merchant
// and third-party locations; it does not create a fulfillment service.
// read_fulfillments is the fulfillments/create + fulfillments/update webhooks:
// they carry the tracking rewrite, and Shopify refuses both topics without it
// (measured 2026-09-24 — shopify.app.ink.toml says how).
export const INK_SCOPES: readonly string[] = Object.freeze([
  "write_orders",
  "read_fulfillments",
  "write_merchant_managed_fulfillment_orders",
  "write_third_party_fulfillment_orders",
]);
