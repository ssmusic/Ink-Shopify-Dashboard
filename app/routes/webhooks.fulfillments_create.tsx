import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { NFSService } from "../services/nfs.server";
import firestore from "../firestore.server";
import { findMerchantDoc } from "../services/merchant-doc.server";

// fulfillments/create — THE TRACKING HOP (Phase-1 rehearsal, 2026-07-02).
//
// Tracking is born here, not at order creation: the merchant fulfills, the
// fulfillment carries carrier + tracking number, and until this handler was
// implemented NO pipe carried them onto the proof (order #1015: fulfilled in
// Shopify, tracking never arrived; every tracking number on a proof before
// this was hand-patched). This handler forwards them to the backend
// (PATCH /api/proofs/:id/tracking), which stores the fields and registers
// the number with the Shippo feed — carrier scans then drive the delivery
// journey on the customer page.
//
// Webhook discipline: ALWAYS 200 once authenticated (Shopify retries
// non-200s and disables flaky subscriptions) — every failure inside is
// logged and swallowed.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, admin } = await authenticate.webhook(request);

  if (!admin) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // Payload is a Fulfillment object.
    const orderId = payload.order_id;
    const trackingNumber =
      (Array.isArray(payload.tracking_numbers) && payload.tracking_numbers[0]) ||
      payload.tracking_number ||
      null;
    const trackingCompany = payload.tracking_company || null;
    const trackingUrl =
      (Array.isArray(payload.tracking_urls) && payload.tracking_urls[0]) ||
      payload.tracking_url ||
      null;

    if (!orderId) {
      console.log(`[${topic}] No order_id on fulfillment payload. Ignoring.`);
      return new Response("OK", { status: 200 });
    }
    if (!trackingNumber) {
      console.log(`[${topic}] Fulfillment for order ${orderId} carries no tracking number. Nothing to forward.`);
      return new Response("OK", { status: 200 });
    }

    // Which proof? The order's ink.proof_reference metafield is the link.
    const response = await admin.graphql(
      `query GetOrderMetafield($id: ID!) {
        order(id: $id) {
          name
          metafield(namespace: "ink", key: "proof_reference") { value }
        }
      }`,
      { variables: { id: `gid://shopify/Order/${orderId}` } },
    );
    const orderJson = await response.json();
    const proofId: string | undefined = orderJson.data?.order?.metafield?.value;
    const orderName: string = orderJson.data?.order?.name ?? String(orderId);

    if (!proofId) {
      console.log(`[${topic}] Order ${orderName} has no ink.proof_reference — not an enrolled order. Ignoring.`);
      return new Response("OK", { status: 200 });
    }

    const merchantHit = await findMerchantDoc(firestore, shop);
    const merchantApiKey = merchantHit?.apiKey ?? null;
    if (!merchantApiKey) {
      console.error(`[${topic}] No ink_api_key for ${shop} — cannot forward tracking for ${orderName} (${proofId}).`);
      return new Response("OK", { status: 200 });
    }

    await NFSService.updateTracking(proofId, merchantApiKey, {
      carrier_name: trackingCompany || undefined,
      tracking_number: trackingNumber,
      tracking_url: trackingUrl || undefined,
    });
    console.log(`✅ [${topic}] Tracking forwarded for ${orderName}: ${trackingCompany ?? "?"} ${trackingNumber} → ${proofId}`);
  } catch (error: any) {
    console.error(`❌ [${topic}] Tracking hop failed (webhook still 200s):`, error?.message ?? error);
  }

  return new Response("OK", { status: 200 });
};
