// Merchant-doc resolver — kills the shopDomain landmine class.
//
// The Phase-1 fulfillment rehearsal (order #1015, 2026-07-02) 500'd because
// webhook handlers query `where("shopDomain" == shop)` — but NO merchant doc
// carries that field: the embed's own docs are keyed by shop domain as the
// DOCUMENT ID (field `shop`), and backend-provisioned docs use snake_case
// `shop_domain`. Third appearance of this landmine (Bible §17.2).
//
// One resolver, every convention: direct doc-id read first (cheapest, the
// embed's own shape), then field fallbacks. Prefer a doc that actually
// carries ink_api_key when several match.

import type { DocumentData, DocumentReference, Firestore } from "firebase-admin/firestore";

export interface MerchantDocHit {
  data: DocumentData;
  apiKey: string | null;
}

export interface MerchantDocRefHit extends MerchantDocHit {
  ref: DocumentReference;
}

/** Same resolver, with the REF — for callers that must WRITE (the
 *  Notifications settings API). Added 2026-08-07 when that route turned out
 *  to carry its own two-convention lookup (fourth appearance of the §17.2
 *  landmine) because this module only returned data. */
export async function findMerchantDocRef(
  firestore: Firestore,
  shop: string,
): Promise<MerchantDocRefHit | null> {
  const hits: Array<{ data: DocumentData; ref: DocumentReference }> = [];

  try {
    const direct = await firestore.collection("merchants").doc(shop).get();
    if (direct.exists) hits.push({ data: direct.data() as DocumentData, ref: direct.ref });
  } catch { /* fall through to field queries */ }

  if (!hits.some((h) => h.data?.ink_api_key)) {
    for (const field of ["shop", "shopDomain", "shop_domain"]) {
      try {
        const snap = await firestore
          .collection("merchants")
          .where(field, "==", shop)
          .limit(5)
          .get();
        snap.docs.forEach((d) => hits.push({ data: d.data(), ref: d.ref }));
        if (hits.some((h) => h.data?.ink_api_key)) break;
      } catch { /* keep trying the next convention */ }
    }
  }

  if (hits.length === 0) return null;
  const withKey = hits.find(
    (h) => typeof h.data?.ink_api_key === "string" && h.data.ink_api_key,
  );
  const hit = withKey ?? hits[0];
  return {
    data: hit.data,
    ref: hit.ref,
    apiKey: (withKey?.data.ink_api_key as string) ?? null,
  };
}

export async function findMerchantDoc(
  firestore: Firestore,
  shop: string,
): Promise<MerchantDocHit | null> {
  const hit = await findMerchantDocRef(firestore, shop);
  return hit ? { data: hit.data, apiKey: hit.apiKey } : null;
}
