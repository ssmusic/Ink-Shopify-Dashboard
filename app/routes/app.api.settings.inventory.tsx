import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import firestore from "../firestore.server";
import { verifyProxyToken } from "../services/token-verify.server";
import { findMerchantDocRefByShopOrId } from "../services/merchant-doc.server";

/**
 * Inventory Settings endpoint (authenticated by warehouse JWT).
 * Reads and writes low_inventory_threshold and min_enrollment_value
 * on the merchant's Firestore document.
 *
 * GET  /app/api/settings/inventory → { low_inventory_threshold, min_enrollment_value }
 * POST /app/api/settings/inventory → update settings
 *
 * WHICH MERCHANT DOC. `findMerchantDocRefByShopOrId` — the resolver every
 * reader of these fields uses, not a private lookup. This route had its own
 * (doc-id by merchant_id, then `where("shopDomain")`), and so did the enroll
 * gate that reads `min_enrollment_value` back. Two private copies agreeing by
 * luck is still the §17.2 landmine: they agree only while the shop holds one
 * merchant doc, and a store that holds two makes the saved minimum invisible
 * to the gate that enforces it.
 */

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

// Token verification: services/token-verify.server.ts (fail-closed; the old
// decodeToken computed an HMAC and then never checked it — pure decode).

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokenPayload = await verifyProxyToken(authHeader.slice(7));
  if (!tokenPayload) {
    return json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const { shop: shopDomain, merchant_id: merchantId } = tokenPayload;

  try {
    const hit = await findMerchantDocRefByShopOrId(firestore, shopDomain, merchantId);
    const data = hit?.data ?? {};

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

  const tokenPayload = await verifyProxyToken(authHeader.slice(7));
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

    const hit = await findMerchantDocRefByShopOrId(firestore, shopDomain, merchantId);
    if (hit) {
      await hit.ref.update(updates);
    } else {
      // Create if doesn't exist. Name the shop under both conventions the
      // resolver searches, so the next save finds this document instead of
      // minting a second one beside it.
      const docId = merchantId || shopDomain || "unknown";
      await firestore.collection("merchants").doc(docId).set({
        ...(shopDomain ? { shop: shopDomain, shopDomain } : {}),
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
