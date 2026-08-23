// THE FLIP — the switch that puts the brand on the page Shopify's emails open.
//
// GET  /app/api/settings/order-door → { on, door, canFlip }
// POST { on: boolean }              → applies it to Shopify, then records it
//
// Shopify's notification templates cannot be edited by any app, so the email's
// primary button always opens Shopify's Order status page. The order-page-block
// extension puts the brand's door on that page — and this route is the only
// thing a merchant has to touch to turn it on. No code, no template, no paste.
//
// THE ORDER OF OPERATIONS IS THE POINT (the return-window law, same file
// family): APPLY FIRST, RECORD SECOND. The Firestore flag is only a record of
// what Shopify already carries. If the metafield write fails we return the
// failure and write NOTHING, so the toggle can never show "on" for a store
// whose order status page is bare — the exact drift the return-window save
// refuses for the same reason.
//
// The slug is resolved the NO-PROOF way (backend merchant doc → brand_slug),
// the same way the snippet card does it, because a settings save has no proof
// in hand. brand_slug only: a domain-derived host looks right and 404s (#1016).

import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import firestore from "../firestore.server";
import { verifyProxyToken } from "../services/token-verify.server";
import { findMerchantDocRef } from "../services/merchant-doc.server";
import { resolveShopFromTokenPayload } from "../services/notification-settings";
import { brandSlugFromDoc } from "../services/brand-page-url.server";
import { getShopIdByDomain } from "../services/ink-api.server";
import { unauthenticated } from "../shopify.server";
import {
  assertOrderDoorMetafield,
  orderDoorBase,
} from "../services/order-door-metafield.server";

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

async function authenticateShop(
  request: Request,
): Promise<{ shop: string } | { error: Response }> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const tokenPayload = await verifyProxyToken(authHeader.slice(7));
  if (!tokenPayload) {
    return { error: json({ error: "Invalid or expired token" }, { status: 401 }) };
  }
  const shop =
    resolveShopFromTokenPayload(tokenPayload) ??
    (typeof tokenPayload.merchant_id === "string" ? tokenPayload.merchant_id : null);
  if (!shop) return { error: json({ error: "Token names no shop" }, { status: 401 }) };
  return { shop };
}

/** The brand's own subdomain label, WITHOUT a proof — backend doc merged over
 *  the embed's, brand_slug only. Empty string when the doc does not say. */
async function resolveSlugNoProof(
  shop: string,
  embedDoc: Record<string, any>,
): Promise<string> {
  try {
    const shopId = await getShopIdByDomain(shop);
    const backend = shopId
      ? ((await firestore.collection("merchants").doc(shopId).get()).data() ?? {})
      : {};
    const merged = { ...embedDoc, ...backend };
    // brandSlugFromDoc falls back to the DOMAIN when no brand_slug exists.
    // That fallback is right for the snippet card's www default and wrong
    // here, so the doc must actually carry brand_slug or we return nothing.
    if (!merged.brand_slug) return "";
    return brandSlugFromDoc(merged, shop);
  } catch (e: any) {
    console.warn(`[settings/order-door] slug unresolved for ${shop}: ${e?.message}`);
    return "";
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  const auth = await authenticateShop(request);
  if ("error" in auth) return auth.error;

  try {
    const hit = await findMerchantDocRef(firestore, auth.shop);
    if (!hit) return json({ error: "Merchant not found" }, { status: 404 });

    const slug = await resolveSlugNoProof(auth.shop, hit.data ?? {});
    return json({
      // Default ON, like branded_tracking_link — only an explicit false is off.
      on: hit.data?.order_door_block !== false,
      door: slug ? orderDoorBase(slug) : null,
      // Without a brand_slug there is no honest door to point at, so the
      // switch says so rather than flipping into a broken state.
      canFlip: Boolean(slug),
    });
  } catch (err: any) {
    console.error("[settings/order-door] GET error:", err.message);
    return json({ error: "Couldn't read the order page setting" }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const auth = await authenticateShop(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json().catch(() => null);
    if (typeof body?.on !== "boolean") {
      return json({ error: "Send { on: true } or { on: false }" }, { status: 400 });
    }
    const on: boolean = body.on;

    const hit = await findMerchantDocRef(firestore, auth.shop);
    if (!hit) return json({ error: "Merchant not found" }, { status: 404 });

    const slug = on ? await resolveSlugNoProof(auth.shop, hit.data ?? {}) : "";
    if (on && !slug) {
      return json(
        {
          error:
            "This store has no brand page yet — connect it to ink first, then turn this on.",
        },
        { status: 409 },
      );
    }

    // APPLY FIRST. `unauthenticated.admin` uses the stored offline session, so
    // this works from a settings save with no admin request in flight.
    const { admin } = await unauthenticated.admin(auth.shop);
    const result = await assertOrderDoorMetafield({
      admin,
      shop: auth.shop,
      // The service reads the flag from what it is GIVEN, not from Firestore,
      // so pass the intended next state — not the stale stored one.
      merchantData: { ...(hit.data ?? {}), order_door_block: on },
      slug,
      label: "[settings] order-door",
    });

    if (result.outcome === "failed") {
      return json(
        { error: "Shopify wouldn't accept the change — nothing was saved." },
        { status: 502 },
      );
    }

    // RECORD SECOND, now that Shopify carries it.
    await hit.ref.set({ order_door_block: on }, { merge: true });
    return json({ success: true, on, door: result.value ?? null, outcome: result.outcome });
  } catch (err: any) {
    console.error("[settings/order-door] POST error:", err.message);
    return json({ error: "Couldn't update the order page setting" }, { status: 500 });
  }
};
