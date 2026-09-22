// PLAN PRECEDENCE — one store, two apps, one backend merchant, and the rule
// for which product the merchant is on.
//
// `merchants/{shop_id}.plan` on the backend is `ink` (free; the flash) or
// `ritualist` (paid; the page); absent reads as ritualist for every merchant
// that existed before ink (ink-backend #118). The two apps share the embed's
// merchant doc (`merchants/{myshopify-domain}`, holding `ink_api_key`) and
// the backend merchant behind it, on purpose: one record per store, so an
// upgrade carries the whole history. The create door ROTATES the api key on
// every call, which is why BOTH installs create only when the shared doc has
// no `ink_api_key` (app.tsx, ink-install.server.ts) — that guard is what
// keeps two apps from re-keying each other, and it must never loosen.
//
// The three orders, each its own function and each pinned by a test:
//
//   1. INK INSTALLS ON AN EXISTING MERCHANT (the Ritualist was first). ink's
//      provision sees the key and does nothing — plan is left exactly as it
//      is. An ink install never downgrades. (ink-install.server.ts; here for
//      the reader.)
//   2. THE RITUALIST INSTALLS ON AN INK MERCHANT. The upgrade: PATCH
//      `plan: "ritualist"` through the admin door, once, stamped on the
//      shared doc under a flavor-named field so the layout loader — which
//      runs on every embedded page — never asks twice. The doc says it was
//      ink's by `ink_shop_id`, which only ink's install writes.
//   3. THE RITUALIST UNINSTALLS WHILE INK IS STILL INSTALLED (ink's own
//      session for the shop exists). Hand the merchant back: PATCH
//      `plan: "ink"` so the link keeps working as ink, and clear the stamp
//      so a later re-install claims again. If ink is not there, leave the
//      plan alone — the store is leaving, and shop/redact will do its work
//      in 48 hours. Nothing here touches the shared doc's key.
//
// Every per-app field these write carries its app's name (`ink_shop_id`,
// `ritualist_plan_claimed_at`): the doc is shared, the columns are not.

import { otherAppHoldsSession } from "../firestore-session-storage.server";
import { resolveInkShopId } from "./ink-install.server";
import { InkApiError, patchMerchant } from "./ink-api.server";
import { getMerchant, updateMerchant, type MerchantData } from "./merchant.server";
import { DEFAULT_NOTIFICATION_SETTINGS } from "./notification-settings";

export type PlanClaimOutcome = "not_an_ink_merchant" | "already_claimed" | "claimed" | "failed";

/** Order 2 — the Ritualist's install on a merchant ink made. Called from the
 *  Ritualist's provision when the shared doc already carries a key. Never
 *  throws: it runs inside app.tsx's fire-and-forget provision. */
export async function claimRitualistPlan({
  shop,
  existing,
}: {
  shop: string;
  existing: MerchantData;
}): Promise<PlanClaimOutcome> {
  // Only ink's install writes ink_shop_id. A doc without it is the
  // Ritualist's own (every merchant today) and there is nothing to claim.
  if (!existing.ink_shop_id) return "not_an_ink_merchant";
  if (existing.ritualist_plan_claimed_at) return "already_claimed";

  try {
    await patchMerchant(existing.ink_shop_id, { plan: "ritualist" });
  } catch (e: any) {
    // Logged, not stamped: the next app load asks again. Until the backend
    // deploy that knows `plan` (ink-backend #118) this is a 400 every load —
    // one line each, and the merchant keeps ink's experience meanwhile.
    console.error(`[plan] The Ritualist could not claim ${shop} (${existing.ink_shop_id}): ${e?.message ?? e}`);
    return "failed";
  }

  await updateMerchant(shop, {
    ritualist_plan_claimed_at: new Date().toISOString(),
    // The Ritualist's install seeds the notification toggles (every sender
    // treats a missing block as "send nothing"); an ink doc never had them.
    ...(existing.notification_settings ? {} : { notification_settings: DEFAULT_NOTIFICATION_SETTINGS }),
  });
  console.log(`[plan] The Ritualist claimed ${shop} (${existing.ink_shop_id}): plan → ritualist`);
  return "claimed";
}

export type PlanRestoreOutcome =
  | "ink_not_installed"
  | "restored"
  | "refused"
  | "transient_failure"
  | "no_shop_id";

/** Order 3 — the Ritualist's uninstall. Throws only when Firestore cannot
 *  say whether ink is installed (the caller answers 500 so Shopify retries:
 *  an unknown must not decide a plan). */
export async function restoreInkPlanOnRitualistUninstall(shop: string): Promise<PlanRestoreOutcome> {
  const inkInstalled = await otherAppHoldsSession(shop);
  if (!inkInstalled) {
    console.log(`[plan] ${shop}: ink is not installed here — plan left as it is.`);
    return "ink_not_installed";
  }

  const doc = await getMerchant(shop);
  const shopId = await resolveInkShopId(shop, doc);
  if (!shopId) {
    console.error(`[plan] ${shop}: ink is installed but no backend shop_id is known — cannot hand the plan back.`);
    return "no_shop_id";
  }

  try {
    await patchMerchant(shopId, { plan: "ink" });
  } catch (e: any) {
    const status = e instanceof InkApiError ? e.status : 0;
    if (status >= 400 && status < 500) {
      // A refusal the backend will keep giving (e.g. a door that does not
      // know `plan` yet). Retrying cannot change it; say so and ack.
      console.error(`[plan] ${shop}: the backend refused plan → ink (${status}): ${e?.message ?? e} — hand it back by hand (PATCH /admin/merchants/${shopId} { plan: "ink" }).`);
      return "refused";
    }
    console.error(`[plan] ${shop}: plan → ink failed (${status || "network"}): ${e?.message ?? e} — will retry.`);
    return "transient_failure";
  }

  await updateMerchant(shop, { ritualist_plan_claimed_at: null });
  console.log(`[plan] ${shop}: the Ritualist left, ink stays — plan → ink (${shopId}).`);
  return "restored";
}
