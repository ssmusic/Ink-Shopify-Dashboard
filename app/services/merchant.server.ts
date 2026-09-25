import { flavorLogger } from "./ink-log.server";
const console = flavorLogger("merchant.server");
import firestore from "../firestore.server";
import type { NotificationSettings } from "./notification-settings";

const COLLECTION = "merchants";

export interface MerchantData {
  shop: string;
  /** Shopify's word, mirrored after the backend took it
   *  (test-store-sync.server.ts): a development store is a test store. */
  test_store?: boolean | null;
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

  // ── THE INK FLAVOR'S OWN FIELDS (app/services/app-flavor.server.ts). ──
  // Written only by an install under APP_FLAVOR=ink; the Ritualist's
  // provision never sets them, so a doc it wrote is byte-identical to before.
  /** The backend merchant id (`shop_…`) from createMerchant's answer — kept
   *  so ink's screens address `merchants/{shop_id}` and the admin PATCH door
   *  directly instead of scanning the merchant list by domain. */
  ink_shop_id?: string;
  /** When the storefront capture was last attempted, and how it went — the
   *  onboarding screen reads these to say "looking", "found", or "try again". */
  ink_mark_captured_at?: string;
  ink_mark_capture_note?: string;
  /** The host label the Worker claimed for this shop — `{slug}.in.ink`. The
   *  backend merchant doc's `brand_slug` is the authority; this is its echo. */
  ink_brand_slug?: string;
  /** When the merchant pressed "Use this" on the captured mark. */
  ink_mark_confirmed_at?: string;

  // ── THE RITUALIST'S OWN FIELD on a doc ink made (plan-precedence.server.ts). ──
  /** When the Ritualist's install claimed an ink merchant's plan (PATCH
   *  plan: "ritualist"); cleared (null) when the Ritualist uninstalls and
   *  hands the merchant back to ink, so a re-install claims it again. */
  ritualist_plan_claimed_at?: string | null;
  /** The Ritualist's PAID plan is active on this store since this instant,
   *  or null (none) — the mirror of what the backend holds (ritualist-plan-sync.server.ts). */
  ritualist_plan_active_at?: string | null;
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
