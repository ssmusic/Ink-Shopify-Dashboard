import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, admin } = await authenticate.webhook(request);

  if (!admin) {
    return new Response("Unauthorized", { status: 401 });
  }

  // We are currently processing deliveries exclusively via orders/fulfilled
  // This webhook just safely accepts the event to keep Shopify happy.
  console.log(`[${topic}] Webhook received for shop: ${shop}. Safe ignoring as we use orders/fulfilled.`);

  return new Response("OK", { status: 200 });
};
