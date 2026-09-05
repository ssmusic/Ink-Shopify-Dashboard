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
 * WHICH MERCHANT DOC. `findMerchantDocRef` — the same resolver the orders/create
 * webhook uses to read this field back, not a private lookup. Both sides used
 * to carry their own (`where("shopDomain")` first, doc-id second). They agreed
 * on all thirteen connected shops when measured 2026-09-05, but only because a
 * `limit(1)` field query happened to return the same document the webhook
 * wanted — Firestore promises no ordering there, so the agreement was luck,
 * not design. One resolver on both ends makes it design.
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

  // The gate still runs; the GET has nothing merchant-specific to read —
  // "background" is the only mode this app supports.
  await authenticate.admin(request);

  try {
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
