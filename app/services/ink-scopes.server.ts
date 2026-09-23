// Shopify write scopes include read. Ink updates orders and tracking at merchant
// and third-party locations; it does not create a fulfillment service.
export const INK_SCOPES: readonly string[] = Object.freeze([
  "write_orders",
  "write_merchant_managed_fulfillment_orders",
  "write_third_party_fulfillment_orders",
]);
