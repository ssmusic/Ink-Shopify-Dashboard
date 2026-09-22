// THE SCOPES INK HOLDS — the running app's copy of shopify.app.ink.toml's
// `access_scopes`. A test pins the two equal, so the list can never drift
// between what the record asks a merchant to grant and what the code
// believes it may select.
//
// Under Shopify managed installation (use_legacy_install_flow = false) the
// TOML is what Shopify grants and the library's `scopes` option is never
// compared to the session (token-exchange.mjs exchanges and stores, no scope
// check). This list still matters: it is what every handler on the enrol and
// tracking path is written against, and the ink-flavor tests measure each
// query's selections against it.
export const INK_SCOPES: readonly string[] = Object.freeze([
  "read_orders",
  "write_orders",
  "read_fulfillments",
  "write_fulfillments",
  "read_assigned_fulfillment_orders",
  "write_assigned_fulfillment_orders",
  "read_merchant_managed_fulfillment_orders",
  "write_merchant_managed_fulfillment_orders",
  "read_third_party_fulfillment_orders",
  "write_third_party_fulfillment_orders",
]);
