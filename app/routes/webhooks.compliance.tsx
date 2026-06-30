import { type ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import firestore from "../firestore.server";

// Single endpoint for Shopify's three MANDATORY compliance/privacy webhooks
// (customers/data_request, customers/redact, shop/redact). Registered in
// shopify.app.toml via one [[webhooks.subscriptions]] `compliance_topics` block
// → one `uri` (the Shopify-prescribed shape). Missing/unregistered compliance
// webhooks are an automatic App Store review failure.
//
// authenticate.webhook HMAC-verifies the request and returns 401 on an invalid
// `X-Shopify-Hmac-Sha256` (a hard review requirement); we then branch on topic.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);

  // Normalize either "customers/redact" or "CUSTOMERS_REDACT" to one form.
  const t = String(topic).toUpperCase().replace(/\//g, "_");
  console.log(`[GDPR] ${t} for ${shop}`);

  switch (t) {
    case "CUSTOMERS_DATA_REQUEST":
      // The app stores NO end-customer PII (Firestore holds merchant config
      // only; order/customer data lives in Shopify + is forwarded to the ink
      // API). Nothing to surface — acknowledge.
      break;

    case "CUSTOMERS_REDACT":
      // No end-customer PII stored in the app DB — nothing to erase. Acknowledge.
      break;

    case "SHOP_REDACT":
      // 48h after uninstall (or on shop deletion): erase the merchant record.
      try {
        await firestore.collection("merchants").doc(shop).delete();
        console.log(`[GDPR] Deleted merchant data for ${shop}`);
      } catch (error) {
        console.error(`[GDPR] Failed to delete merchant data for ${shop}:`, error);
        // Still return 200 — Shopify retries are not desired once we've tried.
      }
      break;

    default:
      console.warn(`[GDPR] Unexpected compliance topic: ${t}`);
  }

  return new Response("OK", { status: 200 });
};
