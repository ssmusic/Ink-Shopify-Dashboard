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
//   2. THE RITUALIST INSTALLS ON AN INK MERCHANT. The arrival, NOT the
//      upgrade. The doc says it was ink's by `ink_shop_id`, which only ink's
//      install writes; this stamps `ritualist_plan_claimed_at` on the shared
//      doc so the layout loader — which runs on every embedded page — does
//      the work once, and seeds the notification toggles an ink doc never
//      had. IT DOES NOT TOUCH THE PLAN. What it DOES write on the backend is
//      the ENTITLEMENT: `ritualist_installed_at` — the instant the paid app
//      landed here (ink-backend #121). The plan says which product the
//      merchant is on; the entitlement says which they may open, and it is
//      what carries an ink merchant to the page-building door (the dashboard
//      fences /onboard and /simple by plan, the-ritualist #1375). Without it
//      an ink merchant who bought the Ritualist had no way to publish, and
//      so no way to earn the flip.
//
//      THE PLAN FLIPS WHEN THE PAGE IS PUBLISHED, NOT WHEN THE APP IS
//      INSTALLED (Sam, 2026-09-22). `page_mode` derives from the plan, so a
//      PATCH here handed an ink merchant's buyers the Ritualist PAGE the
//      moment the app landed — before a brand book existed. That is an
//      unbranded page where they had a clean flash, and the page is the paid
//      product: it must not appear before it is ready. The flip now belongs
//      to the merchant's own publish, through the Worker's
//      `POST /api/merchant/plan` door (the-ritualist), which takes the
//      shop_id from the merchant's JWT and PATCHes with the admin secret only
//      the Worker holds.
//   3. THE RITUALIST UNINSTALLS WHILE INK IS STILL INSTALLED (ink's own
//      session for the shop exists). Hand the merchant back: PATCH
//      `plan: "ink"` so the link keeps working as ink and
//      `ritualist_installed_at: null` so the page doors close again, and
//      clear the local stamp so a later re-install claims again. If ink is not there, leave the
//      buyer-page plan alone but clear both entitlement stamps immediately;
//      shop/redact will do its work in 48 hours. Nothing touches the shared key.
//
// Every per-app field these write carries its app's name (`ink_shop_id`,
// `ritualist_plan_claimed_at`): the doc is shared, the columns are not.

import { otherAppHoldsSession } from "../firestore-session-storage.server";
import { resolveInkShopId } from "./ink-install.server";
import { getMerchantPlan, InkApiError, patchMerchant } from "./ink-api.server";
import { getMerchant, updateMerchant, type MerchantData } from "./merchant.server";
import { DEFAULT_NOTIFICATION_SETTINGS } from "./notification-settings";

export type PlanClaimOutcome = "not_an_ink_merchant" | "already_claimed" | "claimed" | "failed";

/** Order 2 — the Ritualist's install on a merchant ink made. Called from the
 *  Ritualist's provision when the shared doc already carries a key. Never
 *  throws: it runs inside app.tsx's fire-and-forget provision.
 *
 *  It writes the ENTITLEMENT and not the plan: `ritualist_installed_at` on
 *  the backend record, which opens the dashboard's page doors, while the
 *  plan stays the merchant's to earn at the moment their page publishes (see
 *  the header). An ink merchant keeps ink's flash until then. The local stamp
 *  is written only after the backend took it, so a refusal is retried on the
 *  next page load instead of being silently lost. */
export async function claimRitualistPlan({
  shop,
  existing,
}: {
  shop: string;
  existing: MerchantData;
}): Promise<PlanClaimOutcome> {
  const restorePreviousPlan = existing.ritualist_plan_at_uninstall === "ritualist";
  // A Ritualist-first store can later add ink without getting ink_shop_id:
  // ink's install preserves the existing key and returns early. Its saved
  // paid-plan marker still must win on reinstall; resolve the backend id then.
  if (!existing.ink_shop_id && !restorePreviousPlan) return "not_an_ink_merchant";
  if (existing.ritualist_plan_claimed_at && !restorePreviousPlan) return "already_claimed";

  let shopId = existing.ink_shop_id;
  if (!shopId) {
    try {
      shopId = await resolveInkShopId(shop, existing);
    } catch (e: any) {
      console.error(`[plan] The Ritualist could not resolve its previous merchant on ${shop}: ${e?.message ?? e}`);
      return "failed";
    }
    if (!shopId) return "failed";
  }

  try {
    await patchMerchant(shopId, {
      ritualist_installed_at: new Date().toISOString(),
      ...(restorePreviousPlan ? { plan: "ritualist" } : {}),
    });
  } catch (e: any) {
    // Logged, not stamped: the next app load asks again. Until the backend
    // deploy that knows the field (ink-backend #121) this is a 400 each load
    // — one line apiece, and the merchant keeps ink's experience meanwhile.
    console.error(`[plan] The Ritualist could not record its arrival on ${shop} (${shopId}): ${e?.message ?? e}`);
    return "failed";
  }

  await updateMerchant(shop, {
    ritualist_plan_claimed_at: new Date().toISOString(),
    ...(restorePreviousPlan ? { ritualist_plan_at_uninstall: null } : {}),
    // The Ritualist's install seeds the notification toggles (every sender
    // treats a missing block as "send nothing"); an ink doc never had them.
    ...(existing.notification_settings ? {} : { notification_settings: DEFAULT_NOTIFICATION_SETTINGS }),
  });
  if (restorePreviousPlan) {
    console.log(`[plan] ${shop}: the Ritualist came back — plan restored to ritualist`);
  } else {
    console.log(`[plan] The Ritualist arrived on ${shop} (${shopId}): entitled; plan left as ink until the page publishes`);
  }
  return "claimed";
}

export type PlanRestoreOutcome =
  | "entitlement_cleared"
  | "restored"
  | "refused"
  | "transient_failure"
  | "no_shop_id";

/** Order 3 — the Ritualist's uninstall. Throws only when Firestore cannot
 *  say whether ink is installed (the caller answers 500 so Shopify retries:
 *  an unknown must not decide a plan). */
export async function restoreInkPlanOnRitualistUninstall(shop: string): Promise<PlanRestoreOutcome> {
  const inkInstalled = await otherAppHoldsSession(shop);
  const doc = await getMerchant(shop);
  const shopId = await resolveInkShopId(shop, doc);
  if (!shopId) {
    console.error(`[plan] ${shop}: no backend shop_id is known — cannot clear the Ritualist's entitlement.`);
    return "no_shop_id";
  }

  if (!inkInstalled) {
    // Published buyer pages keep their mode until normal privacy cleanup.
    // Paid access ends immediately, including on an external Studio session
    // that still carries a valid JWT. Retain the shared API key for reinstall.
    try {
      await patchMerchant(shopId, { ritualist_installed_at: null, ritualist_plan_active_at: null });
      await updateMerchant(shop, { ritualist_plan_claimed_at: null, ritualist_plan_active_at: null });
    } catch (e: any) {
      console.error(`[plan] ${shop}: could not clear the Ritualist's entitlement (${e?.message ?? e}) — will retry.`);
      return "transient_failure";
    }
    return "entitlement_cleared";
  }

  let currentPlan: "ink" | "ritualist" | null = null;
  try {
    currentPlan = await getMerchantPlan(shopId);
  } catch (e: any) {
    console.error(`[plan] ${shop}: could not read the current plan before uninstall (${e?.message ?? e}); handing back to ink without a restore marker.`);
  }
  if (currentPlan === "ritualist") {
    // A failed marker write must not downgrade a paid plan without a way to
    // restore it. Return 500 via the webhook caller so Shopify can retry.
    try {
      await updateMerchant(shop, { ritualist_plan_at_uninstall: "ritualist" });
    } catch (e: any) {
      console.error(`[plan] ${shop}: could not save the Ritualist restore marker (${e?.message ?? e}) — will retry.`);
      return "transient_failure";
    }
  }

  try {
    // The plan leaves with the app: ink-backend #154 includes the record only
    // while the Ritualist is installed AND its paid plan is active.
    await patchMerchant(shopId, { plan: "ink", ritualist_installed_at: null, ritualist_plan_active_at: null });
  } catch (e: any) {
    const status = e instanceof InkApiError ? e.status : 0;
    if (status >= 400 && status < 500) {
      // A refusal the backend will keep giving (e.g. a door that does not
      // know `plan` yet). Retrying cannot change it; say so and ack.
      console.error(`[plan] ${shop}: the backend refused plan → ink (${status}): ${e?.message ?? e} — hand it back by hand (PATCH /admin/merchants/${shopId} { plan: "ink", ritualist_installed_at: null }).`);
      return "refused";
    }
    console.error(`[plan] ${shop}: plan → ink failed (${status || "network"}): ${e?.message ?? e} — will retry.`);
    return "transient_failure";
  }

  await updateMerchant(shop, { ritualist_plan_claimed_at: null, ritualist_plan_active_at: null });
  console.log(`[plan] ${shop}: the Ritualist left, ink stays — plan → ink, entitlement cleared (${shopId}).`);
  return "restored";
}
