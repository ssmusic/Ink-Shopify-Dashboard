// Server-only: whether Shopify billing runs in TEST mode (no money moves;
// the merchant still walks the approval screen). Set SHOPIFY_BILLING_TEST=true
// in Cloud Run env for the dev-store walk; unset (or anything else) charges
// for real. Default is REAL on purpose: a silent test default would let a
// paying merchant approve a plan that never bills.
export const BILLING_IS_TEST = process.env.SHOPIFY_BILLING_TEST === "true";
