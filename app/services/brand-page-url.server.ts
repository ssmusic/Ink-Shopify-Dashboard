// THE BUYER'S PAGE URL — one author, because two would drift.
//
// `https://{brand}.in.ink/r/{nfc_token}` is the address of the thing this
// whole product is. It was resolved inline in state-email.server.ts, and the
// branded tracking link needs the SAME address on the same order — a second
// copy of this resolution is a guarantee that one day an email and a tracking
// button send the same buyer to two different pages.
//
// Two facts the resolution has to get right, both learned the hard way:
//
//  · THE BRAND LIVES ON THE BACKEND DOC. brand_slug / shop_name / support_email
//    are written to merchants/{shop_id} by the backend; the embed's own doc
//    (keyed by myshopify domain) carries the api key and not the brand. #1016's
//    shipped email went out as sm-test-hhawzn52@in.ink for exactly this reason.
//    So the backend doc is MERGED OVER the embed doc before reading brand.
//  · THE TOKEN IS THE PAGE. Only an nfc_token addresses a real buyer page.
//    `/r/{proof_id}` resolves for nobody without merchant auth, so it is
//    offered ONLY as email's pre-existing fallback and NEVER as an address we
//    hand to Shopify to point customers at.

import { brandSlugFromDomain } from "./email.server";
import { getProof } from "./ink-api.server";

export interface BrandPageResolution {
  /** The real buyer page. Non-null ONLY when a proof carries an nfc_token —
   *  the one URL safe to publish anywhere a customer will click. */
  pageUrl: string | null;
  /** What email has always linked to: the page, or a www fallback that at
   *  least lands somewhere. Kept for byte-identical email behaviour. */
  emailUrl: string;
  nfcToken: string | null;
  brandSlug: string;
  /** The proof's shop_id — the backend's merchant identity, not the domain. */
  proofShopId: string;
  /** Backend merchant doc merged over the embed's, for brand fields. */
  brandDoc: Record<string, any>;
  customerTier: string | null;
}

/** THE BRAND'S OWN SUBDOMAIN LABEL, from a merchant doc.
 *
 *  Split out of `resolveBrandPageUrl` so a caller that has no proof — the
 *  Notifications snippet card — reads the brand the SAME way the tracking
 *  rewrite does. It already drifted once: the verify webhook builds
 *  `sm-test-hhawzn52.in.ink` off the myshopify domain while the rewrite
 *  correctly builds `stevemadden.in.ink` off the backend doc, so the same
 *  order carries two different hosts. This file's header calls that out as
 *  the thing it exists to prevent; a second no-proof copy would have been
 *  the third.
 *
 *  `brand_slug` on the merged doc wins; the shop domain is the last resort
 *  and is exactly what produces a wrong-but-plausible host. */
export function brandSlugFromDoc(
  brandDoc: Record<string, any>,
  shop: string,
): string {
  const brandDomain =
    (brandDoc.shop_domain as string | undefined) ||
    (brandDoc.shopDomain as string | undefined) ||
    shop;
  return (
    brandSlugFromDomain(brandDoc.brand_slug as string | undefined) ||
    brandSlugFromDomain(brandDomain)
  );
}

/** Resolve the buyer page for one proof.
 *
 *  Fail-soft throughout: a proof fetch or merchant-doc read that fails leaves
 *  `pageUrl` null and the caller decides. Nothing here may throw into a
 *  webhook — this runs on the fulfillment path, where the only unforgivable
 *  outcome is a non-200. */
export async function resolveBrandPageUrl({
  merchantApiKey,
  proofId,
  shop,
  merchantData,
  label = "brand-page-url",
}: {
  merchantApiKey?: string | null;
  proofId: string;
  /** The myshopify domain — the last-resort brand source. */
  shop: string;
  /** The embed's own merchant doc (findMerchantDoc().data). */
  merchantData: Record<string, any>;
  label?: string;
}): Promise<BrandPageResolution> {
  let nfcToken: string | null = null;
  let customerTier: string | null = null;
  let proofShopId = "";

  if (merchantApiKey) {
    try {
      const proof = await getProof(merchantApiKey, proofId);
      nfcToken = (proof?.nfc_token as string | undefined) || null;
      customerTier = (proof?.customer_tier as string | undefined) || null;
      proofShopId = String(proof?.shop_id || "");
    } catch (e: any) {
      console.warn(`🔗 ${label}: proof fetch failed (${e?.message}) — no branded page URL.`);
    }
  }

  let brandDoc: Record<string, any> = merchantData;
  if (proofShopId) {
    try {
      const { default: firestore } = await import("../firestore.server");
      const d = await firestore.collection("merchants").doc(proofShopId).get();
      if (d.exists) brandDoc = { ...merchantData, ...(d.data() || {}) };
    } catch (e: any) {
      console.warn(`🔗 ${label}: backend merchant doc fetch failed (${e?.message}) — using embed doc for branding.`);
    }
  }

  const brandSlug = brandSlugFromDoc(brandDoc, shop);

  const pageUrl = brandSlug && nfcToken ? `https://${brandSlug}.in.ink/r/${nfcToken}` : null;
  const emailUrl = pageUrl ?? `https://www.in.ink/r/${nfcToken || proofId}`;

  return { pageUrl, emailUrl, nfcToken, brandSlug, proofShopId, brandDoc, customerTier };
}
