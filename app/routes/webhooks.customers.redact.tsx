import { type ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  
  // CUSTOMERS/REDACT
  // This app's own DB (Firestore) stores merchant config only — no customer
  // PII to erase here. But proofs in the ink-backend DO carry order_details
  // (name/email/address), so full compliance forwards this redaction there.
  // TODO(Phase 5 — PCD): call the ink-backend redaction endpoint once it
  // exists (RUNBOOK_SHOPIFY_APP_OVERHAUL.md, parallelreturns), keyed on
  // payload.customer.id + payload.orders_to_redact.

  return new Response("OK", { status: 200 });
};
