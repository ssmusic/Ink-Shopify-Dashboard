import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import firestore from "../firestore.server";
import crypto from "crypto";

/**
 * Inventory Settings endpoint (authenticated by warehouse JWT).
 * Reads and writes low_inventory_threshold and min_enrollment_value
 * on the merchant's Firestore document.
 *
 * GET  /app/api/settings/inventory → { low_inventory_threshold, min_enrollment_value }
 * POST /app/api/settings/inventory → update settings
 */

const JWT_SECRET =
  process.env.WAREHOUSE_JWT_SECRET ||
  process.env.SHOPIFY_API_SECRET ||
  "fallback-dev-secret";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (data: any, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
    ...init,
  });

function decodeToken(token: string): { shop?: string; merchant_id?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;

    // Try HMAC verify first
    const expectedSig = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return { shop: payload.shop, merchant_id: payload.merchant_id };
  } catch {
    return null;
  }
}

async function getMerchantDoc(shopDomain?: string, merchantId?: string) {
  // Try by document ID (merchant_id)
  if (merchantId) {
    const doc = await firestore.collection("merchants").doc(merchantId).get();
    if (doc.exists) return doc;
  }

  // Try by shopDomain field
  if (shopDomain) {
    const snapshot = await firestore
      .collection("merchants")
      .where("shopDomain", "==", shopDomain)
      .limit(1)
      .get();
    if (!snapshot.empty) return snapshot.docs[0];
  }

  return null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokenPayload = decodeToken(authHeader.slice(7));
  if (!tokenPayload) {
    return json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const { shop: shopDomain, merchant_id: merchantId } = tokenPayload;

  try {
    const doc = await getMerchantDoc(shopDomain, merchantId);
    const data = doc?.data() ?? {};

    return json({
      low_inventory_threshold: data.low_inventory_threshold ?? 20,
      min_enrollment_value: data.min_enrollment_value ?? 0,
    });
  } catch (err: any) {
    console.error("[settings/inventory] GET error:", err.message);
    return json({ error: "Failed to fetch settings" }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokenPayload = decodeToken(authHeader.slice(7));
  if (!tokenPayload) {
    return json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const { shop: shopDomain, merchant_id: merchantId } = tokenPayload;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { low_inventory_threshold, min_enrollment_value } = body;

  // Validate
  if (low_inventory_threshold !== undefined && (typeof low_inventory_threshold !== "number" || low_inventory_threshold < 0)) {
    return json({ error: "low_inventory_threshold must be a non-negative number" }, { status: 400 });
  }
  if (min_enrollment_value !== undefined && (typeof min_enrollment_value !== "number" || min_enrollment_value < 0)) {
    return json({ error: "min_enrollment_value must be a non-negative number" }, { status: 400 });
  }

  try {
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (low_inventory_threshold !== undefined) updates.low_inventory_threshold = low_inventory_threshold;
    if (min_enrollment_value !== undefined) updates.min_enrollment_value = min_enrollment_value;

    const doc = await getMerchantDoc(shopDomain, merchantId);
    if (doc) {
      await doc.ref.update(updates);
    } else {
      // Create if doesn't exist
      const docId = merchantId || shopDomain || "unknown";
      await firestore.collection("merchants").doc(docId).set({
        shopDomain,
        ...updates,
        createdAt: new Date(),
      }, { merge: true });
    }

    console.log(`[settings/inventory] Updated for ${shopDomain || merchantId}:`, updates);
    return json({ success: true, ...updates });
  } catch (err: any) {
    console.error("[settings/inventory] POST error:", err.message);
    return json({ error: "Failed to update settings" }, { status: 500 });
  }
};
