/**
 * Branded tracking link — merchant preference endpoint.
 *
 * GET   → { enabled: boolean }
 * PATCH → { enabled: boolean } persisted to
 *         merchants/{shopDomain}.branded_tracking_link
 *
 * DEFAULT ON (Sam, 2026-08-06): an absent field reads as enabled, so every
 * merchant gets the branded tracking link without touching this screen. The
 * field exists to turn it OFF for one shop; env BRANDED_TRACKING_LINK_DISABLED
 * turns it off everywhere. Both are emergency exits, not opt-ins — which is
 * why `false` is stored explicitly and absence is never treated as a refusal.
 *
 * Reads/writes are gated by `authenticate.admin(request)` from Shopify. Follows
 * the app.api.settings.delivery-mode.tsx precedent exactly.
 */
import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import firestore from "../firestore.server";
import { authenticate } from "../shopify.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (data: any, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
    ...init,
  });

async function getMerchantDoc(shopDomain: string) {
  const direct = await firestore.collection("merchants").doc(shopDomain).get();
  if (direct.exists) return direct;
  for (const field of ["shop", "shopDomain", "shop_domain"]) {
    const snapshot = await firestore
      .collection("merchants")
      .where(field, "==", shopDomain)
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

  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  try {
    const doc = await getMerchantDoc(shopDomain);
    // Absent → ON. Only an explicit false turns it off.
    const enabled = doc?.data()?.branded_tracking_link !== false;
    return json({ enabled, killedGlobally: Boolean(process.env.BRANDED_TRACKING_LINK_DISABLED) });
  } catch (err: any) {
    console.error("[settings/branded-tracking-link] GET error:", err.message);
    return json({ error: "Failed to fetch tracking link setting" }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "PATCH") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  try {
    const body = await request.json();
    const enabled = body?.enabled;
    if (typeof enabled !== "boolean") {
      return json({ error: "Invalid body. Expected { enabled: boolean }" }, { status: 400 });
    }

    const doc = await getMerchantDoc(shopDomain);
    if (!doc) {
      console.warn(
        `[settings/branded-tracking-link] Merchant doc not found for ${shopDomain}; cannot persist`,
      );
      return json(
        { error: "Merchant not registered with The Ritualist backend yet" },
        { status: 404 },
      );
    }

    await doc.ref.update({ branded_tracking_link: enabled, updatedAt: new Date() });
    console.log(`[settings/branded-tracking-link] ${shopDomain} → enabled=${enabled}`);

    return json({ enabled });
  } catch (err: any) {
    console.error("[settings/branded-tracking-link] PATCH error:", err.message);
    return json({ error: "Failed to update tracking link setting" }, { status: 500 });
  }
};
