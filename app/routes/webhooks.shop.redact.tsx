import { isInk } from "../services/app-flavor.server";
import { handleInkPrivacy } from "../services/ink-privacy.server";
import { type ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import firestore from "../firestore.server";
import { purgeShopInInk } from "../services/ink-api.server";
import { OTHER_APP, otherAppHoldsSession } from "../firestore-session-storage.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  if (isInk()) return handleInkPrivacy("shop", shop, payload);

  console.log(`Received ${topic} webhook for ${shop}`);

  // TWO APPS, ONE MERCHANT RECORD. The Ritualist and ink share the embed doc
  // and the backend merchant (one backend, one Firestore, one link). A store
  // that holds both and uninstalls ONE sends that app a shop/redact 48 hours
  // later — and a purge here would erase the merchant the other app is still
  // serving: no api key, no proofs, every order silently un-enrolled. So
  // before anything is deleted, ask whether the other app is still installed
  // (its own offline session for this shop). If it is, the record stays with
  // it; its own shop/redact will erase everything when the store truly
  // leaves. Until ink exists nothing can hold that session, so the
  // Ritualist's path is what it always was. Firestore unable to answer →
  // 500 and Shopify retries: an unknown must never purge.
  let otherStillInstalled = false;
  try {
    otherStillInstalled = await otherAppHoldsSession(shop);
  } catch (error) {
    console.error(`[shop/redact] ${shop}: could not check whether ${OTHER_APP.name} is still installed — not purging; will retry:`, error);
    return new Response("Shop purge deferred — will retry", { status: 500 });
  }
  if (otherStillInstalled) {
    console.warn(
      `[shop/redact] ${shop}: ${OTHER_APP.name} is still installed on this store and shares this merchant record — nothing purged. Its own shop/redact will.`,
    );
    return new Response("OK", { status: 200 });
  }

  // SHOP/REDACT: ~48 hours after uninstall, or when a store requests
  // deletion. Two sides to erase:
  //   1. this app's own merchant doc (embed Firestore) — below;
  //   2. the system of record (ink-backend): the shop's proofs, per-proof
  //      event/return rows, and backend merchant docs — forwarded to
  //      POST /admin/purge-shop (staged; deploy Sam-gated).
  // Response semantics per the #58 retryability doctrine: backend 2xx (incl.
  // merchant-unknown no-op) → 200 · endpoint 404 (backend not deployed yet)
  // → 200 + loud ERROR log · transient 5xx/network → 500 so Shopify
  // redelivers (the embed-doc delete below is idempotent on retry).
  let embedDocDeleted = false;
  try {
    console.log(`[GDPR] Deleting merchant data for ${shop}`);
    await firestore.collection("merchants").doc(shop).delete();
    embedDocDeleted = true;
  } catch (error) {
    console.error(`[GDPR] Failed to delete embed merchant doc for ${shop}:`, error);
  }

  const result = await purgeShopInInk(shop);
  if (result.ok) {
    console.log(
      `[shop/redact] ${shop}: ink-backend purged —`,
      JSON.stringify(result.body?.counts ?? result.body ?? {}),
    );
    return new Response("OK", { status: 200 });
  }
  if (result.status === 404) {
    console.error(
      `[shop/redact] ${shop}: ink-backend purge endpoint NOT DEPLOYED — run manual purge (POST /admin/purge-shop, shop_domain=${shop}).`,
    );
    return new Response("OK", { status: 200 });
  }

  console.error(
    `[shop/redact] ${shop}: backend purge failed (status ${result.status}, embed doc deleted=${embedDocDeleted}) —`,
    JSON.stringify(result.body ?? {}),
  );
  return new Response("Shop purge forward failed — will retry", { status: 500 });
};
