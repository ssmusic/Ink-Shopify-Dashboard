// WHAT AN INSTALL UNDER INK PROVISIONS — the ink flavor's half of app.tsx's
// self-provision, in its own file so the Ritualist's half stays the verbatim
// text it has been since managed install landed.
//
// The Ritualist's install seeds the api key and the notification toggles and
// registers a carrier service. ink's install:
//   1. creates the backend merchant with `plan: "ink"` (the backend's create
//      door learns the field this same build run; until then it is ignored
//      and absent reads as ritualist — nothing breaks either way);
//   2. seeds the embed's own doc with the key and the backend shop_id;
//   3. asks the Worker to capture the brand's mark off its storefront and
//      write it onto the backend merchant doc (brand-mark.server.ts), and
//      records how that went so the onboarding screen can say so.
// No carrier service (ink holds no write_shipping), no notification toggles
// (ink's embed sends no buyer email — there is nothing for them to switch).
//
// Everything here is called fire-and-forget from the layout loader, exactly
// like the Ritualist's provision: it never delays or breaks the app render.
// The onboarding screen polls the doc until the capture has an answer.

import { captureBrandMark, type BrandMarkCapture } from "./brand-mark.server";
import { createMerchant, getShopIdByDomain } from "./ink-api.server";
import { getMerchant, updateMerchant } from "./merchant.server";

type AdminGraphql = { graphql: (query: string, opts?: any) => Promise<Response> };

// The Ritualist asks `shop { name email contactEmail }` and nothing more; ink
// also needs the storefront's address for the capture. Its own string, so the
// Ritualist's wire stays byte-identical. `primaryDomain` needs no scope.
export const SHOP_IDENTITY_QUERY_INK = `#graphql
  query ShopIdentity { shop { name email contactEmail primaryDomain { url } } }`;

export interface ShopIdentity {
  name: string;
  ownerEmail: string;
  siteUrl: string;
}

export async function readShopIdentity(admin: AdminGraphql, shop: string): Promise<ShopIdentity> {
  let name = shop;
  let ownerEmail = "";
  let siteUrl = "";
  try {
    const res = await admin.graphql(SHOP_IDENTITY_QUERY_INK);
    const data = (await res.json())?.data?.shop;
    if (data?.name) name = data.name;
    ownerEmail = data?.email || data?.contactEmail || "";
    siteUrl = data?.primaryDomain?.url || "";
  } catch (e) {
    console.warn("[ink] shop identity fetch failed; provisioning will retry:", e);
  }
  return { name, ownerEmail, siteUrl };
}

export type InkProvisionOutcome =
  | { outcome: "already_provisioned" }
  | { outcome: "no_owner_email" }
  | { outcome: "no_api_key" }
  | { outcome: "provisioned"; shopId: string; capture: BrandMarkCapture };

/** The install. Idempotent: a doc that already carries an api key — written
 *  by ink earlier, or by the Ritualist on a store that holds both apps — is
 *  left exactly as it is; the backend's `plan` on that merchant decides the
 *  experience, never a second install. */
export async function provisionInkMerchant({ admin, shop }: { admin: AdminGraphql; shop: string }): Promise<InkProvisionOutcome> {
  const existing = await getMerchant(shop);
  if (existing?.ink_api_key) return { outcome: "already_provisioned" };

  const identity = await readShopIdentity(admin, shop);
  if (!identity.ownerEmail) {
    console.warn(`[ink] No Shopify owner/contact email for ${shop}; provisioning will retry on the next app load`);
    return { outcome: "no_owner_email" };
  }

  const inkData = await createMerchant(shop, identity.name, identity.ownerEmail, { plan: "ink" });
  if (!inkData?.api_key) return { outcome: "no_api_key" };
  const shopId = String(inkData.shop_id || "");

  await updateMerchant(shop, {
    ink_api_key: inkData.api_key,
    verified_delivery_mode: "background",
    ...(shopId ? { ink_shop_id: shopId } : {}),
  });

  const capture = await captureInkMark({ shop, shopId, siteUrl: identity.siteUrl });
  return { outcome: "provisioned", shopId, capture };
}

/** The capture, on its own so the onboarding screen's "try again" is the
 *  same call the install made. Records the attempt on the embed's doc either
 *  way; never throws. */
export async function captureInkMark({
  shop,
  shopId,
  siteUrl,
}: {
  shop: string;
  shopId: string;
  siteUrl: string;
}): Promise<BrandMarkCapture> {
  const capture = await captureBrandMark({ site: siteUrl, shopId });
  console.log(`[ink] brand mark for ${shop}: ${capture.note}`);
  try {
    await updateMerchant(shop, {
      ink_mark_captured_at: new Date().toISOString(),
      ink_mark_capture_note: capture.note,
    });
  } catch (e) {
    console.warn(`[ink] could not record the capture attempt for ${shop}:`, e);
  }
  return capture;
}

/** The backend merchant id for this shop: the one the install recorded, or
 *  — for a doc the Ritualist wrote before ink existed — the list scan the
 *  Ritualist's own screens use. Empty when neither knows. */
export async function resolveInkShopId(shop: string, doc: { ink_shop_id?: string } | null | undefined): Promise<string> {
  if (doc?.ink_shop_id) return doc.ink_shop_id;
  try {
    return await getShopIdByDomain(shop);
  } catch (e: any) {
    console.warn(`[ink] shop_id unresolved for ${shop}: ${e?.message ?? e}`);
    return "";
  }
}
