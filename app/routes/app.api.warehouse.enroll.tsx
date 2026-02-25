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

async function getMerchantApiKey(shopDomain: string): Promise<string | null> {
  const snapshot = await firestore
    .collection("merchants")
    .where("shopDomain", "==", shopDomain)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  return snapshot.docs[0].data().ink_api_key || null;
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

  // 5. Call INK API enroll endpoint
  const inkResponse = await fetch(`${INK_API_URL}/api/enroll`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(enrollPayload),
  });

  const inkData = await inkResponse.json();

  if (!inkResponse.ok) {
    console.error("[Warehouse Enroll] INK API error:", inkData);
    return json({ error: inkData.error || "Enrollment failed" }, { status: inkResponse.status });
  }

  return json({
    success: true,
    proof_id: inkData.proof_id,
    nfcToken,
    state: inkData.state,
    enrolled_at: inkData.enrolled_at,
  });
};
