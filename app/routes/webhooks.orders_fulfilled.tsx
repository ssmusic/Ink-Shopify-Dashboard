import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { NFSService } from "../services/nfs.server";
import firestore from "../firestore.server";
import { findMerchantDoc } from "../services/merchant-doc.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic, admin } = await authenticate.webhook(request);

  if (!admin) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Payload for orders/fulfilled webhook is an Order object.
  const orderId = payload.id;
  
  if (!orderId) {
    console.error(`[${topic}] No order payload found.`);
    return new Response("Bad Request", { status: 400 });
  }

  const orderGid = `gid://shopify/Order/${orderId}`;
  
  console.log(`[${topic}] Webhook triggered for shop: ${shop}, orderGid: ${orderGid}`);

  // Fetch the proof_reference metafield to see if this order was enrolled in INK
  try {
    // 1. Look up the merchant's ink_api_key — convention-proof resolver
    //    (doc-id first, then shop/shopDomain/shop_domain fields). The old
    //    shopDomain-only query 500'd on every shop whose doc uses the other
    //    conventions (Phase-1 rehearsal, order #1015, 2026-07-02).
    const merchantHit = await findMerchantDoc(firestore, shop);
    const merchantApiKey: string | null = merchantHit?.apiKey ?? null;

    if (!merchantApiKey) {
      console.error(`[${topic}] No ink_api_key found in Firestore for shop: ${shop}. Cannot mark delivered.`);
      return new Response("Merchant API key not found", { status: 500 });
    }
    console.log(`[${topic}] Found ink_api_key for ${shop} (prefix: ${merchantApiKey.slice(0, 12)}...)`);

    // 2. Fetch the proof_reference metafield from Shopify via GraphQL
    const response = await admin.graphql(`
      query GetOrderMetafield($id: ID!) {
        order(id: $id) {
          name
          updatedAt
          metafield(namespace: "ink", key: "proof_reference") {
            value
          }
        }
      }
    `, {
      variables: {
        id: orderGid
      }
    });

    const body = await response.json();
    const proofReference = body.data?.order?.metafield?.value;
    const fulfilledAt = payload.updated_at || body.data?.order?.updatedAt || new Date().toISOString();
    
    // Find carrier info from Shopify fulfillment if available
    let carrier: string | undefined;
    if (payload.fulfillments && payload.fulfillments.length > 0) {
      carrier = payload.fulfillments[0].tracking_company || undefined;
    }

    if (proofReference) {
      // Deliberately DO NOT mark delivered here. orders/fulfilled fires at SHIP
      // time; marking delivered now would pre-empt the REAL carrier "delivered"
      // event (webhooks.fulfillments_update.tsx), which is the authoritative
      // delivered_at. This fixes the "return window opened at ship time" bug.
      // (merchantApiKey / fulfilledAt / carrier stay computed above for a future
      // shipped_at record; markProofDelivered is idempotent first-write-wins, so
      // whoever sets delivered_at first wins — that must be REAL delivery.)
      console.log(`[${topic}] Order ${orderGid} shipped (proof ${proofReference}); delivery is marked on the REAL carrier-delivered event, not at ship time.`);
    } else {
      console.log(`[${topic}] Order ${orderGid} has no INK proof_reference metafield. Skipping (not an INK order).`);
    }

  } catch (error) {
    console.error(`[${topic}] Error processing fulfilled webhook:`, error);
    return new Response("Internal Server Error", { status: 500 });
  }

  return new Response("OK", { status: 200 });
};
