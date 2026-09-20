import { type ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import firestore from "../firestore.server";
import { purgeShopInInk } from "../services/ink-api.server";
import { findMerchantDocRef } from "../services/merchant-doc.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // SHOP/REDACT: ~48 hours after uninstall, or when a store requests
  // deletion. Two sides to erase:
  //   1. this app's own merchant doc(s) (embed Firestore) — below;
  //   2. the system of record (ink-backend): the shop's proofs, per-proof
  //      event/return rows, and backend merchant docs — forwarded to
  //      POST /admin/purge-shop (staged; deploy Sam-gated).
  // Response semantics per the #58 retryability doctrine: backend 2xx (incl.
  // merchant-unknown no-op) → 200 · endpoint 404 (backend not deployed yet)
  // → 200 + loud ERROR log · transient 5xx/network → 500 so Shopify
  // redelivers (the embed-doc delete below is idempotent on retry).
  //
  // BOTH DOCS, NOT JUST doc(shop). A store can hold two merchant docs in
  // THIS SAME Firestore project — the embed's own (doc id = shop domain) and
  // a backend-provisioned one (a random id carrying ink_api_key, and
  // whatever settings the shared resolver has been writing to it: notification
  // preferences, the branded-tracking-link switch, merchant media). Deleting
  // only doc(shop) is a GDPR erasure that leaves a customer's operational
  // data sitting in the OTHER doc, forever — the §17.2 landmine, here as a
  // compliance gap rather than a silent no-op. findMerchantDocRef finds
  // whichever doc the settings routes actually write; both it and the
  // domain-keyed doc are deleted when they differ.
  let embedDocDeleted = false;
  try {
    console.log(`[GDPR] Deleting merchant data for ${shop}`);
    const hit = await findMerchantDocRef(firestore, shop).catch(() => null);
    await firestore.collection("merchants").doc(shop).delete();
    if (hit?.ref && hit.ref.id !== shop) {
      await hit.ref.delete();
    }
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
