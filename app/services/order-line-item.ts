/** One Shopify line item, in the shape the enroll payload wants.
 *
 *  A pure mapper, and it lives here rather than in the webhook route so it can
 *  be tested without standing up Shopify's app config — importing the route
 *  pulls in shopify.server.ts, which throws on an empty appUrl.
 *
 *  `product_url` is the addition (2026-08-08). The customer wire has carried a
 *  `product_url` field on line items for a long time — the adapter already
 *  forwards it, `LineItem` declares it, the tap page can read it — and this
 *  mapping never filled it. So it has been null on EVERY Shopify-enrolled
 *  order, and "view this product" was unbuildable for a reason nobody could
 *  see. Measured, not assumed: the 60-proof Taylor Stitch live corpus carries
 *  zero product_urls.
 *
 *  Same shape as the sku/product_type drop (#820): a field that exists at both
 *  ends and is dropped in the middle is invisible to tsc, the suite and review.
 */
export function productDetailFromLineItem(n: any) {
  return {
    name: n?.title,
    sku: n?.sku || "",
    quantity: n?.quantity ?? 1,
    price: n?.originalUnitPriceSet?.shopMoney?.amount ?? "0",
    image_url: n?.image?.url || null,
    // Omitted, never "", when the product has no storefront page:
    // onlineStoreUrl is null for a product not published to the Online Store
    // channel, and that is the honest answer. The tap page hides the link on
    // absence (law 7), which only works if absent means absent.
    ...(n?.product?.onlineStoreUrl ? { product_url: n.product.onlineStoreUrl } : {}),
  };
}

/** Fold separately-fetched product URLs onto already-built line-item details.
 *
 *  WHY THIS EXISTS AS A SECOND STEP. `product { onlineStoreUrl }` needs the
 *  `read_products` scope, and Shopify fails the ENTIRE query when a selection
 *  is unauthorized — it does not omit the field. Riding the enroll-critical
 *  query, that one selection took enrollment down for every order on every
 *  install and reported success while doing it (real order #1019,
 *  2026-08-09). So the URLs are fetched on their own wire and folded in here;
 *  `urls` is `null` whenever that fetch failed or was refused.
 *
 *  ABSENT MEANS ABSENT. A null/blank entry leaves the detail byte-identical
 *  rather than writing `product_url: ""` — the tap page hides the link on
 *  absence (law 7), and an empty string would render a dead door.
 *
 *  Index-aligned: both come from the same `lineItems(first: 20)` selection on
 *  the same order, so position is the join. A length mismatch (a line item
 *  added between the two calls) simply leaves the unmatched tail unenriched.
 */
export function attachProductUrls<T extends Record<string, unknown>>(
  details: T[],
  urls: (string | null)[] | null,
): T[] {
  if (!urls) return details;
  return details.map((detail, i) => {
    const url = urls[i];
    return url ? ({ ...detail, product_url: url } as T) : detail;
  });
}
