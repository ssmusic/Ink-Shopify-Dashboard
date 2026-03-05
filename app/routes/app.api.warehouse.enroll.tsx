import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import firestore from "../firestore.server";
import crypto from "crypto";

/**
 * Public endpoint (authenticated by warehouse JWT only).
 * Proxies enrollment requests to the INK API using the merchant's stored api_key.
 * 
 * POST /app/api/warehouse/enroll
 * Body (JSON): { orderId, nfcToken, nfcUid?, shippingAddress?, warehouseLat?, warehouseLng?, orderDetails? }
 *
 * Response: { proof_id, nfcToken, state, enrolled_at }
 */

const json = (data: any, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
    ...init,
  });

const INK_API_URL =
  process.env.INK_API_URL ||
  process.env.NFS_API_URL ||
  "https://us-central1-inink-c76d3.cloudfunctions.net/api";

const JWT_SECRET =
  process.env.WAREHOUSE_JWT_SECRET ||
  process.env.SHOPIFY_API_SECRET ||
  "fallback-dev-secret";

function verifyToken(token: string): { shop: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSig = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");
    if (signature !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

import { createMerchant, enrollOrder } from "../services/ink-api.server";

async function getMerchantApiKey(shopDomain: string): Promise<string | null> {
  const snapshot = await firestore
    .collection("merchants")
    .where("shopDomain", "==", shopDomain)
    .limit(1)
    .get();

  let apiKey = snapshot.empty ? null : snapshot.docs[0].data().ink_api_key;
  let docId = snapshot.empty ? null : snapshot.docs[0].id;

  if (!apiKey || apiKey === "sk_test_fallback") {
    console.log(`[Warehouse Proxy] Key missing or fallback for ${shopDomain}. Calling INK Admin API...`);
    try {
      const inkRes = await createMerchant(shopDomain, shopDomain, `admin@${shopDomain}`);
      apiKey = inkRes.api_key;
      
      if (docId) {
        await firestore.collection("merchants").doc(docId).update({
          ink_api_key: apiKey,
          updatedAt: new Date(),
        });
      } else {
        await firestore.collection("merchants").add({
          shopDomain,
          ink_api_key: apiKey,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    } catch (e: any) {
      console.error("[Warehouse Proxy] Failed to auto-create merchant:", e.message);
      apiKey = process.env.INK_API_KEY || "sk_test_fallback";
      if (!docId) {
         await firestore.collection("merchants").add({
          shopDomain,
          ink_api_key: apiKey,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
  }
  
  return apiKey;
}

// CORS preflight
export const loader = async ({ request }: LoaderFunctionArgs) => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  // 1. Verify warehouse JWT
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = verifyToken(authHeader.slice(7));
  if (!payload) {
    return json({ error: "Invalid or expired token" }, { status: 401 });
  }

  // 2. Get merchant's INK api_key
  const apiKey = await getMerchantApiKey(payload.shop);
  if (!apiKey) {
    return json({ error: "Merchant not found or not linked to INK" }, { status: 404 });
  }

  // 3. Parse request body
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { orderId, nfcToken, nfcUid, shippingAddress, warehouseLat, warehouseLng, orderDetails } = body;

  if (!orderId || !nfcToken) {
    return json({ error: "orderId and nfcToken are required" }, { status: 400 });
  }

  // 4. Build enrollment payload for INK API
  const enrollPayload: any = {
    order_id: orderId,
    nfc_token: nfcToken,
  };

  if (nfcUid) enrollPayload.nfc_uid = nfcUid;
  if (shippingAddress) enrollPayload.shipping_address = shippingAddress;
  if (orderDetails) enrollPayload.order_details = orderDetails;
  if (warehouseLat && warehouseLng) {
    enrollPayload.warehouse_location = { lat: warehouseLat, lng: warehouseLng };
  }

  // 5. Call INK API enroll endpoint using the shared service
  let inkData;
  try {
    inkData = await enrollOrder(
      apiKey, 
      orderId, 
      nfcToken, 
      orderDetails, 
      shippingAddress,
      warehouseLat && warehouseLng ? { lat: warehouseLat, lng: warehouseLng } : undefined,
      nfcUid
    );
  } catch (error: any) {
    console.error("[Warehouse Enroll] INK API error:", error.message);
    
    // If we get a 401 Unauthorized here, it specifically means the `apiKey` we got from Firestore 
    // is invalid (e.g. it's the sk_test_fallback key or the merchant was deleted on INK).
    // We can intercept this specific error to self-heal by wiping the invalid key and forcing a recreation.
    if (error.message.includes("401") || error.message.includes("Unauthorized") || error.message.includes("Invalid API key")) {
      console.log(`[Warehouse Proxy] INK API rejected key for ${payload.shop}. Forcing regeneration...`);
      // Update firestore to wipe the key so it regenerates on the next try
      const merchantDocs = await firestore.collection("merchants").where("shopDomain", "==", payload.shop).limit(1).get();
      if (!merchantDocs.empty) {
        await firestore.collection("merchants").doc(merchantDocs.docs[0].id).update({ ink_api_key: "sk_test_fallback" });
      }
      return json({ error: "API connection reset. Please press Enroll again." }, { status: 401 });
    }
    
    return json({ error: error.message || "Enrollment failed" }, { status: 500 });
  }

  // 6. Update Shopify Metafields immediately so the dashboard reflects the enrolled state + GPS
  try {
    const { getOfflineSession } = await import("../session-utils.server");
    const session = await getOfflineSession(payload.shop);
    
    if (session) {
        const adminGraphql = async (query: string, variables?: any) => {
            const response = await fetch(`https://${session.shop}/admin/api/2024-10/graphql.json`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Shopify-Access-Token": session.accessToken,
                },
                body: JSON.stringify({ query, variables }),
            });
            return response.json();
        };

        const numericOrderId = orderId.replace(/\D/g, ""); // Extract numbers for safety
        const initialGid = `gid://shopify/Order/${numericOrderId}`;
        
        // Find correct order GID matching across possible stores (similar to ink.update.tsx fallback logic)
        let foundOrderGid = initialGid;
        
        try {
            const nameQuery = `#graphql
              query FindOrderByName($query: String!) {
                orders(first: 1, query: $query) {
                  edges { node { id } }
                }
              }
            `;
            const searchResult = await adminGraphql(nameQuery, { query: `name:${numericOrderId}` });
            if (searchResult?.data?.orders?.edges?.length > 0) {
              foundOrderGid = searchResult.data.orders.edges[0].node.id;
            } else {
              const searchResult2 = await adminGraphql(nameQuery, { query: `name:#${numericOrderId}` });
              if (searchResult2?.data?.orders?.edges?.length > 0) {
                foundOrderGid = searchResult2.data.orders.edges[0].node.id;
              }
            }
        } catch (searchErr) {
            console.error("[Warehouse Enroll] Order search error, using presumed GID:", searchErr);
        }

        const metafields = [
            {
                ownerId: foundOrderGid,
                namespace: "ink",
                key: "verification_status",
                type: "single_line_text_field",
                value: "enrolled",
            },
            {
                ownerId: foundOrderGid,
                namespace: "ink",
                key: "nfc_uid",
                type: "single_line_text_field",
                value: nfcUid || nfcToken,
            },
            {
                ownerId: foundOrderGid,
                namespace: "ink",
                key: "proof_reference",
                type: "single_line_text_field",
                value: inkData.proof_id,
            }
        ];

        if (warehouseLat && warehouseLng) {
            metafields.push({
                ownerId: foundOrderGid,
                namespace: "ink",
                key: "warehouse_gps",
                type: "json",
                value: JSON.stringify({ lat: warehouseLat, lng: warehouseLng }),
            });
        }

        const mutation = `
            mutation SetEnrollmentMetafields($metafields: [MetafieldsSetInput!]!) {
                metafieldsSet(metafields: $metafields) {
                    userErrors { field message }
                }
            }
        `;
        
        const mResp = await adminGraphql(mutation, { metafields });
        if (mResp.data?.metafieldsSet?.userErrors?.length > 0) {
            console.error("[Warehouse Enroll] Metafield update errors:", mResp.data.metafieldsSet.userErrors);
        } else {
            console.log(`[Warehouse Enroll] Successfully updated metafields for ${foundOrderGid} via App endpoint`);
        }
    } else {
        console.warn(`[Warehouse Enroll] No offline session found to update metafields for ${payload.shop}`);
    }
  } catch (err: any) {
      console.error("[Warehouse Enroll] Failed to update Shopify metafields locally:", err.message);
  }

  return json({
    success: true,
    proof_id: inkData.proof_id,
    nfcToken,
    state: inkData.state,
    enrolled_at: inkData.enrolled_at,
  });
};
