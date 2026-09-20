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
  /** The discounts door (Track C): when this store's discounts were last
   *  walked into the backend after the read_discounts grant, how many, and
   *  whether the walk was cut short (a webhook-time backfill is bounded). */
  discounts_backfilled_at?: string;
  discounts_backfill_count?: number;
  discounts_backfill_partial?: boolean;
}

export const getMerchant = async (shop: string): Promise<MerchantData | null> => {
  try {
    const doc = await firestore.collection(COLLECTION).doc(shop).get();
    if (!doc.exists) return null;
    return doc.data() as MerchantData;
  } catch (error) {
    console.error("Error fetching merchant:", error);
    return null;
  }
};

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
