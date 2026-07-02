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

import type { Firestore, DocumentData } from "firebase-admin/firestore";

export interface MerchantDocHit {
  data: DocumentData;
  apiKey: string | null;
}

export async function findMerchantDoc(
  firestore: Firestore,
  shop: string,
): Promise<MerchantDocHit | null> {
  const hits: DocumentData[] = [];

  try {
    const direct = await firestore.collection("merchants").doc(shop).get();
    if (direct.exists) hits.push(direct.data() as DocumentData);
  } catch { /* fall through to field queries */ }

  if (!hits.some((d) => d?.ink_api_key)) {
    for (const field of ["shop", "shopDomain", "shop_domain"]) {
      try {
        const snap = await firestore
          .collection("merchants")
          .where(field, "==", shop)
          .limit(5)
          .get();
        snap.docs.forEach((d) => hits.push(d.data()));
        if (hits.some((d) => d?.ink_api_key)) break;
      } catch { /* keep trying the next convention */ }
    }
  }

  if (hits.length === 0) return null;
  const withKey = hits.find((d) => typeof d?.ink_api_key === "string" && d.ink_api_key);
  const data = withKey ?? hits[0];
  return { data, apiKey: (withKey?.ink_api_key as string) ?? null };
}
