import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  // orders/fulfilled fires when the merchant SHIPS the order — not when the
  // carrier delivers it. It used to stamp proof.delivered_at here, which started
  // the return window at ship time (too early) and, because markProofDelivered is
  // first-write-wins, prevented the real carrier-delivered signal from ever
  // setting delivered_at.
  //
  // Delivery is now sourced from `fulfillments/update` with
  // shipment_status === "delivered" (Shopify's carrier-aggregated delivery
  // event). See webhooks.fulfillments_update.tsx. Shippo tracking remains a
  // non-Shopify fallback, and PATCH /proofs/:id/delivered is still the manual
  // trigger for demos / carriers that don't report tracking to Shopify.
  //
  // This handler is intentionally inert for the delivery state machine; it only
  // acknowledges the fulfillment so Shopify stops retrying.
  console.log(
    `[${topic}] Order ${payload?.id ?? "?"} fulfilled (shipped) for ${shop}. ` +
      `delivered_at is NOT set here — awaiting fulfillments/update DELIVERED.`,
  );

  return new Response("OK", { status: 200 });
};
