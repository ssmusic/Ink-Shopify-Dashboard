/**
 * The tracking-link card's preferences — one endpoint, three switches.
 *
 * GET   → { enabled, shopifyShippingEmail, brandPageEmail, killedGlobally }
 * PATCH → any subset of { enabled, shopifyShippingEmail, brandPageEmail },
 *         persisted to merchants/{shopDomain}.{branded_tracking_link,
 *         shopify_shipping_email, brand_page_email}
 *
 * THE TWO NEW ONES (Sam's ruling, 2026-09-05 — "the email from shopify should
 * have a link to the buyers in.ink order"):
 *
 *  · `shopify_shipping_email` — DEFAULT ON, like the tracking link above it.
 *    When a merchant fulfills WITHOUT ticking Shopify's own notification, their
 *    buyer gets no shipping email at all; this lets Shopify send exactly one,
 *    from the merchant's own template, whose tracking button is the brand's
 *    page. A buyer who already had a shipping email never gets a second
 *    (shopify-shipping-notice.server.ts decides, from Shopify's own timeline).
 *  · `brand_page_email` — DEFAULT OFF, and deliberately the other way round: it
 *    is a NEW email to someone else's customer, which is the merchant's call.
 *    Only an explicit `true` turns it on.
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
import {
  readTrackingCardSwitches,
  trackingCardUpdatesFrom,
} from "../services/tracking-card-switches";

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
    // Absent → ON for the first two, OFF for the third; the rule lives in one
    // place (tracking-card-switches.ts) so the screen and the webhooks agree.
    const switches = readTrackingCardSwitches(doc?.data());
    return json({
      ...switches,
      killedGlobally: Boolean(process.env.BRANDED_TRACKING_LINK_DISABLED),
      shopifyShippingEmailKilledGlobally: Boolean(process.env.SHOPIFY_SHIPPING_EMAIL_DISABLED),
      brandPageEmailKilledGlobally: Boolean(process.env.BRAND_PAGE_EMAIL_DISABLED),
    });
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

    // Only known keys move a switch, and only a literal boolean moves one —
    // the sanitizer discipline the notification settings already use. A body
    // that names nothing we recognise is a 400, never a silent no-op.
    const updates = trackingCardUpdatesFrom(body);

    if (Object.keys(updates).length === 0) {
      return json(
        {
          error:
            "Invalid body. Expected at least one of { enabled, shopifyShippingEmail, brandPageEmail } as a boolean",
        },
        { status: 400 },
      );
    }

    const doc = await getMerchantDoc(shopDomain);
    if (!doc) {
      console.warn(
        `[settings/branded-tracking-link] Merchant doc not found for ${shopDomain}; cannot persist`,
      );
      return json(
        { error: "Merchant not registered with the Ritualist backend yet" },
        { status: 404 },
      );
    }

    await doc.ref.update({ ...updates, updatedAt: new Date() });
    console.log(
      `[settings/branded-tracking-link] ${shopDomain} → ` +
        Object.entries(updates)
          .map(([k, v]) => `${k}=${v}`)
          .join(" "),
    );

    return json(readTrackingCardSwitches({ ...(doc.data() ?? {}), ...updates }));
  } catch (err: any) {
    console.error("[settings/branded-tracking-link] PATCH error:", err.message);
    return json({ error: "Failed to update tracking link setting" }, { status: 500 });
  }
};
