import firestore from "../firestore.server";
import type { NotificationSettings } from "./notification-settings";

const COLLECTION = "merchants";

export interface MerchantData {
  shop: string;
  ink_api_key?: string;
  verified_delivery_mode?: "addon" | "background";
  /** Seeded at provision. Every sender treats a MISSING value as "send
   *  nothing", so a doc without one is a merchant whose toggles don't exist.
   *  See services/notification-settings.ts. */
  notification_settings?: NotificationSettings;
  updatedAt?: string;
  /** First provision. Settings renders this as the install date — it was
   *  never written, so that row read "Not available" forever. */
  createdAt?: string;
}

// getMerchant() used to live here — a doc-id-only read (`doc(shop).get()`,
// no fallback). Its one real caller, app.tsx's self-provisioning loader,
// now resolves through `findMerchantDocRef` instead (services/merchant-doc.
// server.ts), which also checks the backend's snake_case shop_domain field
// and prefers whichever doc actually carries ink_api_key — the §17.2
// landmine this doc-id-only shape kept re-triggering on every embedded page
// load for a store holding two merchant docs. Deleted rather than kept
// unused; `git log -S "export const getMerchant"` has it if anything ever
// needs a doc-id-only read again.

export const updateMerchant = async (shop: string, data: Partial<MerchantData>) => {
  try {
    const ref = firestore.collection(COLLECTION).doc(shop);
    const now = new Date().toISOString();

    // STAMP THE INSTALL ONCE. Settings shows this as "Installed:", and nothing
    // ever wrote it — so that row read "Not available" for every merchant who
    // had ever installed, permanently. Only set on the first write, so an
    // existing merchant's date is never rewritten by a later update.
    //
    // `shopDomain` is written alongside `shop` on purpose: the standalone auth
    // path writes `shopDomain` and queries by it, this path writes `shop` and
    // keys by document id, and the Settings lookup was searching for a field
    // this writer never set. Writing both ends the mismatch without migrating
    // either shape.
    const existing = await ref.get();
    const stamp = existing.exists && (existing.data() as MerchantData)?.createdAt
      ? {}
      : { createdAt: now };

    await ref.set(
      { ...data, shop, shopDomain: shop, ...stamp, updatedAt: now },
      { merge: true }
    );
  } catch (error) {
    console.error("Error updating merchant:", error);
    throw error;
  }
};
