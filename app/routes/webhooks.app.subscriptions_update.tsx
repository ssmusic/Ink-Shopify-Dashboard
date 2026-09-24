import { flavorLogger } from "../services/ink-log.server";
const console = flavorLogger("webhooks.app.subscriptions_update");
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { isInk } from "../services/app-flavor.server";
import { getMerchant } from "../services/merchant.server";
import { syncRitualistPlan } from "../services/ritualist-plan-sync.server";

// THE RITUALIST'S PLAN CHANGED (Shopify's app_subscriptions/update — the
// Ritualist only; server/ink-mounts.mjs never mounts it under ink). The
// payload is a hint, not the truth: the handler asks Shopify for the store's
// active subscriptions, the same read the app open makes, and records the
// answer on the backend (services/ritualist-plan-sync.server.ts). A cancel
// made in Shopify's admin lands here even if the merchant never opens the app
// again. Retryability: an unknown or a backend refusal → 500, Shopify retries.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, admin } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  if (isInk()) return new Response();
  // No offline session: the app is gone from the store; the uninstall
  // webhook clears the plan (plan-precedence.server.ts).
  if (!admin) return new Response();
  const outcome = await syncRitualistPlan({ admin, shop, existing: await getMerchant(shop), force: true });
  if (outcome === "unknown" || outcome === "failed") {
    return new Response(`plan not recorded (${outcome}) — will retry`, { status: 500 });
  }
  return new Response();
};
