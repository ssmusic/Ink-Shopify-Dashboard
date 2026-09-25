// WHERE THE TRACKING LINK GOES — the app's server for the control
// (app/lib/buyer-door-choice.ts has the table and the words).
//
// READ: the backend merchant record, by its id, straight from Firestore —
// the six door fields and nothing else leave this file. The Ritualist's
// screens already read that record this way (ink-merchant.server.ts); ink's
// did not need it until this control, and a copy kept on ink's own doc would
// go stale the moment the Ritualist app or the dashboard wrote the dial.
//
// WRITE: through the backend's admin door (patchMerchant), from this server —
// never a secret in the browser. The shop is the Shopify session's; the
// choice word is the only thing the browser decides. The Ritualist-page
// choices are refused unless the store is on the Ritualist's plan.

import firestore from "../firestore.server";
import { getMerchant } from "./merchant.server";
import { resolveInkShopId } from "./ink-install.server";
import { patchMerchant } from "./ink-api.server";
import {
  BUYER_DOOR_CHOICE_DIALS,
  buyerDoorView,
  choicesFor,
  isBuyerDoorChoice,
  type BuyerDoorAnswer,
} from "../lib/buyer-door-choice";

const DOOR_FIELDS = ["plan", "page_mode", "flash_face", "flash_forward", "flash_ask", "ritualist_installed_at"] as const;

export interface BuyerDoorDeps {
  shopIdOf: (shop: string) => Promise<string>;
  readRecord: (shopId: string) => Promise<Record<string, unknown> | null>;
  patch: (shopId: string, fields: Record<string, string | null>) => Promise<Record<string, any>>;
}

function project(data: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!data) return null;
  const out: Record<string, unknown> = {};
  for (const f of DOOR_FIELDS) if (data[f] !== undefined) out[f] = data[f];
  return out;
}

export const defaultBuyerDoorDeps: BuyerDoorDeps = {
  shopIdOf: async (shop) => {
    const doc = await getMerchant(shop);
    return doc?.ink_api_key || (doc as any)?.ink_shop_id ? resolveInkShopId(shop, doc) : "";
  },
  readRecord: async (shopId) => {
    const snap = await firestore.collection("merchants").doc(shopId).get();
    return snap.exists ? project(snap.data() ?? null) : null;
  },
  patch: (shopId, fields) => patchMerchant(shopId, fields),
};

const NOT_READY = "This store is still being set up. Try again in a moment."; // PLACEHOLDER

export async function readBuyerDoor(shop: string, deps: BuyerDoorDeps = defaultBuyerDoorDeps): Promise<BuyerDoorAnswer> {
  try {
    const shopId = await deps.shopIdOf(shop);
    if (!shopId) return { ok: false, error: NOT_READY };
    const record = await deps.readRecord(shopId);
    if (!record) return { ok: false, error: NOT_READY };
    return { ok: true, view: buyerDoorView(record) };
  } catch (e: any) {
    console.warn(`[buyer-door] read failed for ${shop}: ${e?.message ?? e}`);
    return { ok: false, error: "This setting could not be read. Refresh to try again." }; // PLACEHOLDER
  }
}

export async function saveBuyerDoor(shop: string, choice: unknown, deps: BuyerDoorDeps = defaultBuyerDoorDeps): Promise<BuyerDoorAnswer> {
  if (!isBuyerDoorChoice(choice)) return { ok: false, error: "Pick where the buyer goes." }; // PLACEHOLDER
  try {
    const shopId = await deps.shopIdOf(shop);
    if (!shopId) return { ok: false, error: NOT_READY };
    const record = await deps.readRecord(shopId);
    if (!record) return { ok: false, error: NOT_READY };
    const plan = buyerDoorView(record).plan;
    if (!choicesFor(plan).includes(choice)) {
      return { ok: false, error: "The Ritualist page is not on this store yet." }; // PLACEHOLDER
    }
    const fresh = await deps.patch(shopId, BUYER_DOOR_CHOICE_DIALS[choice]);
    console.log(`[buyer-door] ${shop} (${shopId}) chose ${choice}`);
    return { ok: true, view: buyerDoorView(project(fresh) ?? {}) };
  } catch (e: any) {
    console.error(`[buyer-door] save failed for ${shop}: ${e?.message ?? e}`);
    return { ok: false, error: `Nothing was changed. ${e?.message ?? ""}`.trim() }; // PLACEHOLDER
  }
}
