import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import firestore from "../firestore.server";
import { enrollOrder, uploadMedia } from "../services/ink-api.server";
import crypto from "crypto";

/**
 * Public endpoint (authenticated by warehouse JWT only).
 * Proxies media upload requests to INK API using the merchant's api_key.
 *
 * POST /app/api/warehouse/upload
 * Headers: Authorization: Bearer <warehouse_token>
 * Body: multipart/form-data with fields: proof_id, media (files)
 */

const JWT_SECRET =
  process.env.WAREHOUSE_JWT_SECRET ||
  process.env.SHOPIFY_API_SECRET ||
  "fallback-dev-secret";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (data: any, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
    ...init,
  });

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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return new Response(null, { status: 204, headers: corsHeaders });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Verify warehouse JWT
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = verifyToken(authHeader.slice(7));
  if (!payload) {
    return json({ error: "Invalid or expired token" }, { status: 401 });
  }

  // Get merchant's INK api_key
  const apiKey = await getMerchantApiKey(payload.shop);
  if (!apiKey) {
    return json({ error: "Merchant not found or not linked to INK" }, { status: 404 });
  }

  // Forward the multipart form data directly to the INK API
  const formData = await request.formData();
  
  try {
    const result = await uploadMedia(apiKey, formData);
    return json({ success: true, ...result });
  } catch (err: any) {
    console.error("[Warehouse Upload] Error:", err.message);
    return json({ error: err.message || "Upload failed" }, { status: 500 });
  }
};
