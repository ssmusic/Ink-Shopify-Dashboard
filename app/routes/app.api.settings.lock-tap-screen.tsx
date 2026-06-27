import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import firestore from "../firestore.server";

/**
 * Lock-the-tap-screen setting endpoint (authenticated by warehouse JWT).
 * Reads and writes the boolean `lock_tap_screen` flag on the merchant's
 * Firestore document — the SAME field the INK backend reads (default false).
 *
 * When ON, each customer's receipt freezes to the tap page they saw on their
 * FIRST tap (snapshotted server-side onto proof.tap_page by the INK backend);
 * the merchant keeps editing the live page for new customers. When OFF (the
 * default), the receipt renders LIVE.
 *
 * GET  /app/api/settings/lock-tap-screen → { lock_tap_screen }
 * POST /app/api/settings/lock-tap-screen → update lock_tap_screen
 *
 * Cloned from app.api.settings.notifications.tsx (same auth + merchant-doc
 * resolution), swapping the notification_settings blob for this single flag.
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

function decodeToken(token: string): { shop?: string; merchant_id?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [, body] = parts;

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return { shop: payload.shop, merchant_id: payload.merchant_id };
  } catch {
    return null;
  }
}

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

  try {
    const docRef = await getMerchantDocRef(tokenPayload.shop, tokenPayload.merchant_id);
    if (!docRef) return json({ error: "Merchant not found" }, { status: 404 });

    const data = (await docRef.get()).data() ?? {};

    return json({
      lock_tap_screen: data.lock_tap_screen === true,
    });
  } catch (err: any) {
    console.error("[settings/lock-tap-screen] GET error:", err.message);
    return json({ error: "Failed to fetch lock-tap-screen setting" }, { status: 500 });
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

  const tokenPayload = decodeToken(authHeader.slice(7));
  if (!tokenPayload) {
    return json({ error: "Invalid or expired token" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const on = payload?.lock_tap_screen === true;

    const docRef = await getMerchantDocRef(tokenPayload.shop, tokenPayload.merchant_id);
    if (!docRef) {
      return json({ error: "Merchant not found" }, { status: 404 });
    }

    await docRef.update({
      lock_tap_screen: on,
    });

    return json({ success: true, lock_tap_screen: on });
  } catch (err: any) {
    console.error("[settings/lock-tap-screen] POST error:", err.message);
    return json({ error: "Failed to update lock-tap-screen setting" }, { status: 500 });
  }
};
