// A TEST STORE, SAID BY SHOPIFY — kept apart from live data (2026-09-25,
// Shopify's protected customer data review: "Do you keep test and production
// data separate?").
//
// ink-backend #162 stamps `test_store` on the backend merchant: a test
// store's records are left out of every cross-store total and reach the
// retention line after 90 days, not 24 months (utils/testStore.js). Only
// Shopify knows whether a store is a development store —
// `shop.plan.partnerDevelopment`, readable by any app with no scope — so
// this app writes what Shopify says, on every app open, in BOTH apps (a
// development store is a test store whichever app it installed), at most once
// per SYNC_EVERY_MS per store and process. The install is an open, so a new
// store is stamped on its first load.
//
// Laws, the plan sync's (ritualist-plan-sync.server.ts): a read that fails
// decides NOTHING; the shared doc's mirror is written only after the backend
// took the value, so a refusal is asked again on the next open; a write only
// when the answer changed. An operator's stamp stands on the backend —
// Shopify's word never clears it (the backend answers `test_store_kept`).
// Measured 2026-09-25 with each store's own session: SM Test, Corvara,
// ink-test-store-2/3, jatin, smusic-official and taimoor1-2 answer true; the
// store named "ink." (dmg4mi-8i, Basic plan) answers false.

import { patchMerchant } from "./ink-api.server";
import { resolveInkShopId } from "./ink-install.server";
import { updateMerchant, type MerchantData } from "./merchant.server";

export const SYNC_EVERY_MS = 10 * 60 * 1000;

export const DEV_STORE_QUERY = `#graphql
  query TestStorePlan { shop { plan { partnerDevelopment } } }
`;

/** Shopify's answer → true (a development store), false (a live store), or
 *  null when the body is not Shopify's answer (the read failed: decide
 *  nothing). */
export function partnerDevelopmentOf(body: unknown): boolean | null {
  const v = (body as { data?: { shop?: { plan?: { partnerDevelopment?: unknown } } } } | null)
    ?.data?.shop?.plan?.partnerDevelopment;
  return typeof v === "boolean" ? v : null;
}

type AdminGraphql = { graphql: (query: string, options?: any) => Promise<{ json: () => Promise<unknown> }> };

export type TestStoreSyncOutcome = "throttled" | "unknown" | "unchanged" | "no_shop_id" | "recorded" | "kept" | "failed";

const lastAsked = new Map<string, number>();

/** Ask Shopify whether this store is a development store, and record it on
 *  the backend merchant when the answer changed. Never throws. */
export async function syncTestStore({
  admin,
  shop,
  existing,
  now = new Date(),
}: {
  admin: AdminGraphql;
  shop: string;
  existing: Partial<MerchantData> | null | undefined;
  now?: Date;
}): Promise<TestStoreSyncOutcome> {
  const t = now.getTime();
  const last = lastAsked.get(shop);
  if (last !== undefined && t - last < SYNC_EVERY_MS) return "throttled";
  lastAsked.set(shop, t);

  let dev: boolean | null;
  try {
    const res = await admin.graphql(DEV_STORE_QUERY);
    dev = partnerDevelopmentOf(await res.json());
  } catch {
    dev = null;
  }
  if (dev === null) {
    console.warn(`[test-store] ${shop}: Shopify's plan could not be read — nothing recorded, asked again next time.`);
    lastAsked.delete(shop);
    return "unknown";
  }

  const doc = existing ?? {};
  if (doc.test_store === dev) return "unchanged";

  const shopId = await resolveInkShopId(shop, doc);
  if (!shopId) {
    console.error(`[test-store] ${shop}: no backend merchant known — test_store=${dev} is not recorded.`);
    lastAsked.delete(shop);
    return "no_shop_id";
  }
  let merchant: Record<string, any>;
  try {
    merchant = await patchMerchant(shopId, { test_store: dev, test_store_source: "shopify" });
  } catch (e: any) {
    console.error(`[test-store] ${shop} (${shopId}): the backend did not take test_store=${dev}: ${e?.message ?? e} — asked again next open.`);
    lastAsked.delete(shop);
    return "failed";
  }
  if (merchant?.test_store === true && merchant?.test_store_source === "operator" && dev === false) {
    // An operator stamped this store; Shopify's word does not clear it. The
    // mirror says what the backend holds, so the next open is "unchanged".
    await updateMerchant(shop, { test_store: true });
    console.log(`[test-store] ${shop} (${shopId}): Shopify says ${dev ? "development" : "live"}; an operator's test stamp stands.`);
    return "kept";
  }
  await updateMerchant(shop, { test_store: dev });
  console.log(`[test-store] ${shop} (${shopId}): Shopify says ${dev ? "a development store — stamped test" : "a live store"} — recorded.`);
  return "recorded";
}
