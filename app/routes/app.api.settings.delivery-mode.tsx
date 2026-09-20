/**
 * Verified Delivery Mode — merchant preference endpoint.
 *
 * GET   → returns { mode: "background" }
 * PATCH → accepts { mode: "background" } and persists to
 * merchants/{shopDomain}.verified_delivery_mode
 *
 * Mode meaning:
 *   - "background":            INK is hidden from checkout. Every order on
 *                  this shop is silently tagged for INK enrollment regardless
 *                  of which shipping method the customer picked.
 *
 * Reads/writes are gated by `authenticate.admin(request)` from Shopify.
 *
 * WHICH MERCHANT DOC. `findMerchantDocRef` — the same resolver the
 * fulfillment webhook uses. This route carried its own private lookup
 * (field query on "shopDomain" FIRST, doc-id fallback second) — backwards
 * from, and less complete than, the shared resolver, so on a store holding
 * two merchant docs (embed's own by domain id, backend's by a random id
 * carrying ink_api_key) this could silently persist the mode to a doc
 * nothing downstream reads (§17.2 landmine).
 */
import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import firestore from "../firestore.server";
import { authenticate } from "../shopify.server";
import { setCarrierServiceActive } from "../services/carrier-service.server";
import { findMerchantDocRef } from "../services/merchant-doc.server";

const VALID_MODES = ["background"] as const;
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  try {
    await findMerchantDocRef(firestore, shopDomain);
    const mode: DeliveryMode = "background";
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

    const hit = await findMerchantDocRef(firestore, shopDomain);
    if (!hit) {
      console.warn(
        `[settings/delivery-mode] Merchant doc not found for ${shopDomain}; cannot persist mode`
      );
      return json(
        { error: "Merchant not registered with the Ritualist backend yet" },
        { status: 404 }
      );
    }

    await hit.ref.update({
      verified_delivery_mode: mode,
      updatedAt: new Date(),
    });

    // Propagate to Shopify: INK should not appear as a customer-paid checkout
    // carrier option during App Store review. Failure is logged by the helper
    // but doesn't fail the save.
    await setCarrierServiceActive(admin, false);

    console.log(
      `[settings/delivery-mode] ${shopDomain} → mode=${mode}, carrier active=false`
    );

    return json({ mode });
  } catch (err: any) {
    console.error("[settings/delivery-mode] PATCH error:", err.message);
    return json({ error: "Failed to update delivery mode" }, { status: 500 });
  }
};
