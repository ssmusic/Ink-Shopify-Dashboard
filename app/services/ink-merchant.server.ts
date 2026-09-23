import { isInk } from "./app-flavor.server";
// WHAT INK'S SCREENS READ — the merchant as its two records tell it.
//
// A shop has two merchant docs in one Firestore: the embed's own, keyed by
// the myshopify domain (the api key, ink's install notes), and the backend's,
// keyed by `shop_…` (the plan, the buyer's door, the mark). Both screens need
// both, so this is the one reader. Fail-soft: a doc that cannot be read is
// null, and the screen renders what it has — never a 500 on the merchant's
// first open.

import firestore from "../firestore.server";
import { getMerchant, type MerchantData } from "./merchant.server";
import { resolveInkShopId } from "./ink-install.server";

export interface InkMerchantView {
  shop: string;
  /** The embed's own doc; null until the install's provision has written it. */
  doc: MerchantData | null;
  /** The backend merchant id; "" when neither record knows it yet. */
  shopId: string;
  /** The backend merchant doc; null when unknown or unreadable. */
  backend: Record<string, any> | null;
}

export async function readInkMerchant(shop: string): Promise<InkMerchantView> {
  const doc = await getMerchant(shop);
  // No api key yet means the install's provision has not landed; asking the
  // backend for a shop_id now would only scan its list for a merchant that
  // is still being created.
  const shopId = doc?.ink_api_key ? await resolveInkShopId(shop, doc) : "";
  if (isInk()) {
    const saved = (doc as any)?.ink_flash_forward;
    const backend =
      saved === "carrier" || saved === "order_status"
        ? { flash_forward: saved }
        : null;
    return { shop, doc, shopId, backend };
  }
  let backend: Record<string, any> | null = null;
  if (shopId) {
    try {
      const snap = await firestore.collection("merchants").doc(shopId).get();
      backend = snap.exists ? (snap.data() ?? null) : null;
    } catch (e: any) {
      console.warn(
        `[ink] backend merchant doc unreadable for ${shop} (${shopId}): ${e?.message ?? e}`,
      );
    }
  }
  return { shop, doc, shopId, backend };
}

/** The mark the flash will paint, or null. Written by the Worker's capture
 *  (`write: "merchant"`) onto the backend doc; read here, never derived. */
export function markOf(view: InkMerchantView): string | null {
  const url = view.backend?.brand_logo_url;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

/** The name the screens print when there is no mark: the backend's
 *  shop_name, then the embed's, then the domain. */
export function brandNameOf(view: InkMerchantView): string {
  const fromBackend = view.backend?.shop_name;
  if (typeof fromBackend === "string" && fromBackend.trim())
    return fromBackend.trim();
  const fromEmbed = (view.doc as any)?.shopName;
  if (typeof fromEmbed === "string" && fromEmbed.trim())
    return fromEmbed.trim();
  return view.shop.replace(/\.myshopify\.com$/i, "");
}

export const FLASH_FORWARDS = ["order_status", "carrier"] as const;
export type FlashForward = (typeof FLASH_FORWARDS)[number];

/** The forward dial as the backend holds it; absent is `order_status`
 *  (ink-backend utils/buyerDoor.js — the same default, read the same way). */
export function flashForwardOf(view: InkMerchantView): FlashForward {
  const raw = view.backend?.flash_forward;
  return raw === "carrier" ? "carrier" : "order_status";
}

export type InkStage = "provisioning" | "capturing" | "ready";

/** Where the record is: no api key yet → the install is still landing; an
 *  ink install with no capture note yet → the Worker is still looking;
 *  otherwise there is an answer to show. A doc the Ritualist provisioned
 *  (no ink_shop_id) never had an ink capture, so it is "ready" at once and
 *  the screen offers "look again". */
export function stageOf(
  doc:
    | {
        ink_api_key?: string;
        ink_shop_id?: string;
        ink_mark_captured_at?: string;
      }
    | null
    | undefined,
): InkStage {
  if (!doc?.ink_api_key) return "provisioning";
  if (doc.ink_shop_id && !doc.ink_mark_captured_at) return "capturing";
  return "ready";
}
