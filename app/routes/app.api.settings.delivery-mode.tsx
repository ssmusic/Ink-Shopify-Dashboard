/**
 * Verified Delivery Mode — merchant preference endpoint.
 *
 * GET   → returns { mode: "addon" | "background" }
 * PATCH → accepts { mode } and persists to merchants/{shopDomain}.verified_delivery_mode
 *
 * Mode meaning:
 *   - "addon"      (default): INK shows as a customer-facing checkout option,
 *                  the customer chooses + pays. Current behavior.
 *   - "background":            INK is hidden from checkout. Every order on
 *                  this shop is silently tagged for INK enrollment regardless
 *                  of which shipping method the customer picked. Merchant
 *                  absorbs the cost.
 *
 * Reads/writes are gated by `authenticate.admin(request)` from Shopify.
 */
import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import firestore from "../firestore.server";
import { authenticate } from "../shopify.server";
import { setCarrierServiceActive } from "../services/carrier-service.server";

const VALID_MODES = ["addon", "background"] as const;
type DeliveryMode = (typeof VALID_MODES)[number];

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
  const snapshot = await firestore
    .collection("merchants")
    .where("shopDomain", "==", shopDomain)
    .limit(1)
    .get();
  if (!snapshot.empty) return snapshot.docs[0];
  // Fallback: doc keyed by domain directly
  const direct = await firestore.collection("merchants").doc(shopDomain).get();
  if (direct.exists) return direct;
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
    const mode: DeliveryMode = doc?.data()?.verified_delivery_mode || "addon";
    return json({ mode });
  } catch (err: any) {
    console.error("[settings/delivery-mode] GET error:", err.message);
    return json({ error: "Failed to fetch delivery mode" }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "PATCH") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const { admin, session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  try {
    const body = await request.json();
    const mode = body?.mode as string | undefined;

    if (!mode || !VALID_MODES.includes(mode as DeliveryMode)) {
      return json(
        { error: `Invalid mode. Must be one of: ${VALID_MODES.join(", ")}` },
        { status: 400 }
      );
    }

    const doc = await getMerchantDoc(shopDomain);
    if (!doc) {
      console.warn(
        `[settings/delivery-mode] Merchant doc not found for ${shopDomain}; cannot persist mode`
      );
      return json(
        { error: "Merchant not registered with INK backend yet" },
        { status: 404 }
      );
    }

    await doc.ref.update({
      verified_delivery_mode: mode,
      updatedAt: new Date(),
    });

    // Propagate to Shopify: when mode is "addon", Shopify should call our
    // shipping-rates callback at checkout (active=true). When "background",
    // we want Shopify to stop calling it so the customer no longer sees INK
    // among their shipping options (active=false). Failure to propagate is
    // logged but doesn't fail the save — the mode persists in Firestore and
    // can be re-synced on next app load.
    const carrierActive = mode === "addon";
    await setCarrierServiceActive(admin, carrierActive);

    console.log(
      `[settings/delivery-mode] ${shopDomain} → mode=${mode}, carrier active=${carrierActive}`
    );

    return json({ mode });
  } catch (err: any) {
    console.error("[settings/delivery-mode] PATCH error:", err.message);
    return json({ error: "Failed to update delivery mode" }, { status: 500 });
  }
};
