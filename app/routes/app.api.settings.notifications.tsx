import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import firestore from "../firestore.server";
import crypto from "crypto";

/**
 * Notification Settings endpoint (authenticated by warehouse JWT).
 * Reads and writes notification preferences (channels, delivery, reminders, returnReminders)
 * on the merchant's Firestore document.
 *
 * GET  /app/api/settings/notifications → { settings }
 * POST /app/api/settings/notifications → update settings
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

async function getMerchantDocRef(shopDomain?: string, merchantId?: string) {
  if (merchantId) {
    const docRef = firestore.collection("merchants").doc(merchantId);
    if ((await docRef.get()).exists) return docRef;
  }

  if (shopDomain) {
    const snapshot = await firestore
      .collection("merchants")
      .where("shopDomain", "==", shopDomain)
      .limit(1)
      .get();
    if (!snapshot.empty) return snapshot.docs[0].ref;
  }

  return null;
}

const defaultSettings = {
  channels: { email: true, sms: false },
  delivery: { outForDelivery: true, delivered: true, deliveryConfirmed: false },
  reminders: { hours4: true, hours24: true, hours48: false },
  returnReminders: { days7: true, hours48: false },
  returnWindow: "30"
};

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

  try {
    const docRef = await getMerchantDocRef(tokenPayload.shop, tokenPayload.merchant_id);
    if (!docRef) return json({ error: "Merchant not found" }, { status: 404 });

    const data = (await docRef.get()).data() ?? {};
    
    return json({
      settings: data.notification_settings ?? defaultSettings,
    });
  } catch (err: any) {
    console.error("[settings/notifications] GET error:", err.message);
    return json({ error: "Failed to fetch notification settings" }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokenPayload = await verifyProxyToken(authHeader.slice(7));
  if (!tokenPayload) {
    return json({ error: "Invalid or expired token" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const docRef = await getMerchantDocRef(tokenPayload.shop, tokenPayload.merchant_id);
    
    if (!docRef) {
      return json({ error: "Merchant not found" }, { status: 404 });
    }

    await docRef.update({
      notification_settings: payload,
    });

    return json({ success: true, settings: payload });
  } catch (err: any) {
    console.error("[settings/notifications] POST error:", err.message);
    return json({ error: "Failed to update notification settings" }, { status: 500 });
  }
};
