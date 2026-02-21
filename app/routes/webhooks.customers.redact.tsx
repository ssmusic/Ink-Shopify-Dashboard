import { type ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  
  // CUSTOMERS/REDACT
  // We don't store customer PII in our App's database (Firestore only stores Merchant config).
  // The customer data is either in Shopify (which handles this) or passed to INK API (which is external).
  // So we just acknowledge.

  return new Response("OK", { status: 200 });
};
